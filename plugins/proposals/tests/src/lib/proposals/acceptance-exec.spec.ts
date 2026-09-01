/**
 * acceptance-exec.spec.ts
 *
 * M8: the acceptance runner must (1) run in an injected cwd, (2) honour
 * quotes and pipes, and (3) on timeout kill the WHOLE process group so no
 * descendant outlives the criterion. These use plain POSIX commands so
 * they run under vitest without a Bun global (unlike the integration spec).
 */

import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
	runAcceptanceCriteria,
	tokenizeArgv,
	commandNeedsShell,
} from '@mcp-vertex/proposals/lib/proposals/proposal-acceptance';

const itUnixOnly = process.platform === 'win32' ? it.skip : it;
const trackedPids = new Set<number>();
const nodeEvalCommand = (source: string): string =>
	`${JSON.stringify(process.execPath)} -e ${JSON.stringify(source)}`;

const isPidAlive = (pid: number): boolean => {
	try {
		process.kill(pid, 0);
		return true;
	} catch (error) {
		return (error as NodeJS.ErrnoException).code !== 'ESRCH';
	}
};

const waitForPidExit = async (pid: number): Promise<boolean> => {
	for (let attempt = 0; attempt < 80; attempt += 1) {
		if (!isPidAlive(pid)) return true;
		await new Promise((resolve) => setTimeout(resolve, 25));
	}
	return !isPidAlive(pid);
};

describe('tokenizeArgv (M8 quote-aware parser)', async () => {
	it('keeps a double-quoted argument with spaces as one token', async () => {
		expect(tokenizeArgv('printf "a b" c')).toEqual(['printf', 'a b', 'c']);
	});
	it('keeps a single-quoted argument as one token', async () => {
		expect(tokenizeArgv("echo 'one two'")).toEqual(['echo', 'one two']);
	});
	it('handles backslash escapes outside quotes', async () => {
		expect(tokenizeArgv('echo a\\ b')).toEqual(['echo', 'a b']);
	});
	it('collapses runs of whitespace', async () => {
		expect(tokenizeArgv('  echo    hi  ')).toEqual(['echo', 'hi']);
	});
});

describe('commandNeedsShell (M8)', async () => {
	it('is false for a plain command (even with quotes)', async () => {
		expect(commandNeedsShell('echo "a b"')).toBe(false);
		expect(commandNeedsShell('printf hi')).toBe(false);
	});
	it('is true for pipes, redirects, chaining and subshells', async () => {
		expect(commandNeedsShell('echo hi | grep hi')).toBe(true);
		expect(commandNeedsShell('echo hi > /tmp/x')).toBe(true);
		expect(commandNeedsShell('a && b')).toBe(true);
		expect(commandNeedsShell('echo $(date)')).toBe(true);
	});
});

describe('runAcceptanceCriteria — M8 exec semantics', async () => {
	let dir = '';
	beforeEach(() => {
		dir = mkdtempSync(join(tmpdir(), 'accept-exec-'));
	});
	afterEach(() => {
		rmSync(dir, { recursive: true, force: true });
		for (const pid of trackedPids) {
			try {
				process.kill(pid, 'SIGKILL');
			} catch {
				// best-effort cleanup for a failed assertion path
			}
		}
		trackedPids.clear();
	});

	it('runs the command in the injected cwd', async () => {
		const marker = dir.split('/').pop()!;
		const res = await runAcceptanceCriteria(
			[{ command: 'pwd', expect: `contains:${marker}` }],
			{ cwd: dir },
		);
		expect(res.allPassed).toBe(true);
		expect(res.results[0]?.actual).toContain(marker);
	});

	it('spawns with a non-interactive env without losing existing variables', async () => {
		const existingKey = 'ACCEPTANCE_TEST_EXISTING';
		const previousValue = process.env[existingKey];
		process.env[existingKey] = 'keep-me';
		try {
			const res = await runAcceptanceCriteria([
				{
					command: nodeEvalCommand(
						[
							'process.stdout.write(JSON.stringify({',
							'CI: process.env.CI,',
							'GIT_TERMINAL_PROMPT: process.env.GIT_TERMINAL_PROMPT,',
							'GCM_INTERACTIVE: process.env.GCM_INTERACTIVE,',
							'npm_config_yes: process.env.npm_config_yes,',
							'NPM_CONFIG_YES: process.env.NPM_CONFIG_YES,',
							'preserved: process.env.ACCEPTANCE_TEST_EXISTING,',
							'}));',
						].join(' '),
					),
					expect: 'exit0',
				},
			]);
			expect(res.allPassed).toBe(true);
			const payload = JSON.parse(
				res.results[0]?.actual ?? '{}',
			) as Record<string, string>;
			expect(payload).toMatchObject({
				CI: '1',
				GIT_TERMINAL_PROMPT: '0',
				GCM_INTERACTIVE: 'Never',
				npm_config_yes: 'true',
				NPM_CONFIG_YES: 'true',
				preserved: 'keep-me',
			});
		} finally {
			if (previousValue === undefined) delete process.env[existingKey];
			else process.env[existingKey] = previousValue;
		}
	});

	it('respects quotes: a spaced argument stays a single token', async () => {
		// Without the quote-aware parser, `printf '[%s]'` would receive the
		// split tokens `"a` and `b"` and print `["a][b"]` instead of `[a b]`.
		const res = await runAcceptanceCriteria([
			{ command: 'printf "[%s]" "a b"', expect: 'contains:[a b]' },
		]);
		expect(res.results[0]?.actual).toBe('[a b]');
		expect(res.allPassed).toBe(true);
	});

	it('runs a pipeline through the shell', async () => {
		const res = await runAcceptanceCriteria([
			{ command: 'echo hello | grep hello', expect: 'contains:hello' },
		]);
		expect(res.allPassed).toBe(true);
	});

	it('reports a missing binary as a structured failure (no throw)', async () => {
		const res = await runAcceptanceCriteria([
			{ command: 'this-binary-does-not-exist-xyz', expect: 'exit0' },
		]);
		expect(res.allPassed).toBe(false);
		expect(res.results[0]?.reason ?? '').toMatch(/spawn failed/i);
	});

	it('times out and returns a structured timeout failure', async () => {
		const startedAt = Date.now();
		const res = await runAcceptanceCriteria([
			{ command: 'sleep 5', expect: 'exit0', timeoutMs: 100 },
		]);
		expect(res.allPassed).toBe(false);
		expect(res.results[0]?.reason ?? '').toMatch(/timeout/i);
		expect(res.results[0]?.reason ?? '').toMatch(/terminated/i);
		expect(res.results[0]?.failureKind).toBe('timeout');
		expect(res.results[0]?.recovery).toContain(
			'retry the command with non-interactive flags or explicit argv',
		);
		// It returned because of the kill, not because sleep finished.
		expect(Date.now() - startedAt).toBeLessThan(3000);
	});

	it('classifies prompting output as interactive without treating normal output as interactive', async () => {
		const interactive = await runAcceptanceCriteria([
			{
				command: nodeEvalCommand(
					"process.stderr.write('Enter password: '); process.exit(1);",
				),
				expect: 'exit0',
			},
		]);
		expect(interactive.results[0]?.failureKind).toBe('interactive');
		expect(interactive.results[0]?.recovery).toContain(
			'retry the command with non-interactive flags or explicit argv',
		);

		const normal = await runAcceptanceCriteria([
			{
				command: nodeEvalCommand(
					"process.stderr.write('promptly failed without a prompt'); process.exit(1);",
				),
				expect: 'exit0',
			},
		]);
		expect(normal.results[0]?.failureKind).toBe('exit');
	});

	it('kills descendants of a shell pipeline on timeout (no zombie writes)', async () => {
		// The shell spawns a child that would write a marker AFTER a delay.
		// If the timeout only killed the shell leader, the child would
		// survive and create the marker. Process-group kill must prevent it.
		const marker = join(dir, 'late.txt');
		const res = await runAcceptanceCriteria([
			{
				command: `sleep 1 && echo LATE > ${marker}`,
				expect: 'exit0',
				timeoutMs: 100,
			},
		]);
		expect(res.results[0]?.reason ?? '').toMatch(/timeout/i);
		// Wait past when the descendant WOULD have written the marker.
		await new Promise((r) => setTimeout(r, 1500));
		expect(existsSync(marker)).toBe(false);
	});

	itUnixOnly(
		'aborts promptly and reaps descendants of a long-lived criterion',
		async () => {
			const controller = new AbortController();
			// The criterion announces its descendant's pid through a file
			// rather than stdout, because the test has to KNOW the
			// descendant exists before it aborts. Aborting on a fixed
			// 100ms wall clock raced the spawn on a loaded machine: the
			// run was cancelled before the pid was ever written, `actual`
			// came back empty, and the spec failed on a NaN pid while the
			// behaviour under test was perfectly fine.
			const pidFile = join(dir, 'descendant-pid.txt');
			const script = [
				"const { spawn } = require('node:child_process');",
				"const { writeFileSync } = require('node:fs');",
				"const child = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], { stdio: 'ignore' });",
				`writeFileSync(${JSON.stringify(pidFile)}, String(child.pid));`,
				'process.stdout.write(String(child.pid));',
				'setInterval(() => {}, 1000);',
			].join(' ');
			const pending = runAcceptanceCriteria(
				[
					{
						command: `${process.execPath} -e ${JSON.stringify(script)}`,
						expect: 'exit0',
					},
				],
				{ signal: controller.signal },
			);
			// Wait for the descendant to exist, then abort. Promptness is
			// measured from the abort, which is what the contract is about.
			let spawnedPid = Number.NaN;
			for (let attempt = 0; attempt < 400; attempt += 1) {
				if (existsSync(pidFile)) {
					spawnedPid = Number.parseInt(
						readFileSync(pidFile, 'utf8').trim(),
						10,
					);
					if (Number.isFinite(spawnedPid)) break;
				}
				await new Promise((resolve) => setTimeout(resolve, 25));
			}
			expect(Number.isFinite(spawnedPid)).toBe(true);
			trackedPids.add(spawnedPid);
			const abortedAt = Date.now();
			controller.abort();
			const res = await pending;
			expect(Date.now() - abortedAt).toBeLessThan(3000);
			expect(res.allPassed).toBe(false);
			expect(res.results[0]?.aborted).toBe(true);
			expect(res.results[0]?.timedOut).toBe(false);
			expect(res.results[0]?.reason ?? '').toMatch(/abort/i);
			expect(res.results[0]?.failureKind).toBe('aborted');
			expect(res.results[0]?.recovery).toContain(
				'close the blocked terminal or child process group before retrying',
			);
			expect(await waitForPidExit(spawnedPid)).toBe(true);
			trackedPids.delete(spawnedPid);
		},
	);

	it('keeps successful results backward-compatible for existing consumers', async () => {
		const res = await runAcceptanceCriteria([
			{ command: 'printf ok', expect: 'contains:ok' },
		]);
		expect(res.allPassed).toBe(true);
		expect(res.results[0]?.failureKind).toBeUndefined();
		expect(res.results[0]?.recovery).toBeUndefined();
	});
});

import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { runArgv, runCommand } from '../../../../src/lib/shared/run-command';

const describeUnixOnly =
	process.platform === 'win32' ? describe.skip : describe;
const trackedPids = new Set<number>();

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

afterEach(() => {
	for (const pid of trackedPids) {
		try {
			process.kill(pid, 'SIGKILL');
		} catch {
			// best-effort cleanup for a failed assertion path
		}
	}
	trackedPids.clear();
});

describe('runArgv stdin (x00169)', () => {
	// The default `stdio: ['ignore', ...]` closes stdin immediately — a
	// command shaped like `cat` (or `kubectl apply -f -`) reads EOF and
	// never sees anything the caller meant to pipe in.
	it('closes stdin when none is provided', async () => {
		const result = await runArgv(['cat']);
		expect(result.code).toBe(0);
		expect(result.stdout).toBe('');
	});

	it('pipes the given stdin to the child process', async () => {
		const result = await runArgv(['cat'], { stdin: 'hello from x00169' });
		expect(result.code).toBe(0);
		expect(result.stdout).toBe('hello from x00169');
	});

	it('pipes stdin through a real shell round-trip (wc -c)', async () => {
		const payload = 'apiVersion: v1\nkind: Pod\n';
		const result = await runArgv(['wc', '-c'], { stdin: payload });
		expect(result.code).toBe(0);
		expect(result.stdout.trim()).toBe(String(payload.length));
	});
});

describeUnixOnly('runCommand abort handling (x00239)', () => {
	it('aborts a shell command promptly and reaps its descendant tree', async () => {
		const controller = new AbortController();
		// The leader announces its descendant's pid through a file rather
		// than only stdout, because the test has to KNOW the descendant
		// exists before it aborts. Aborting on a fixed 100ms wall clock
		// raced the spawn on a loaded machine: the command was cancelled
		// before the pid was ever emitted, `output` came back empty, and
		// the spec failed on a NaN pid while the reaping behaviour under
		// test was perfectly fine.
		const dir = mkdtempSync(join(tmpdir(), 'run-command-reap-'));
		const pidFile = join(dir, 'descendant-pid.txt');
		const leaderScript = [
			"const { spawn } = require('node:child_process');",
			"const { writeFileSync } = require('node:fs');",
			"const child = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], { stdio: 'ignore' });",
			`writeFileSync(${JSON.stringify(pidFile)}, String(child.pid));`,
			'process.stdout.write(String(child.pid));',
			'setInterval(() => {}, 1000);',
		].join(' ');
		const pending = runCommand(
			`${process.execPath} -e ${JSON.stringify(leaderScript)}`,
			{
				cwd: process.cwd(),
				signal: controller.signal,
				maxOutputBytes: 64,
			},
		);
		try {
			// Wait for the descendant to exist, then abort. Promptness is
			// measured from the abort, which is what the contract is about.
			let descendantPid = Number.NaN;
			for (let attempt = 0; attempt < 400; attempt += 1) {
				if (existsSync(pidFile)) {
					descendantPid = Number.parseInt(
						readFileSync(pidFile, 'utf8').trim(),
						10,
					);
					if (Number.isFinite(descendantPid)) break;
				}
				await new Promise((resolve) => setTimeout(resolve, 25));
			}
			expect(Number.isFinite(descendantPid)).toBe(true);
			trackedPids.add(descendantPid);
			const abortedAt = Date.now();
			controller.abort();
			const result = await pending;
			expect(Date.now() - abortedAt).toBeLessThan(3000);
			expect(result.code).toBe(130);
			expect(result.aborted).toBe(true);
			expect(result.timedOut).toBe(false);
			expect(await waitForPidExit(descendantPid)).toBe(true);
			trackedPids.delete(descendantPid);
		} finally {
			rmSync(dir, { recursive: true, force: true });
		}
	});
});

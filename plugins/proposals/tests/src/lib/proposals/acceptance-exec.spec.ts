/**
 * acceptance-exec.spec.ts
 *
 * M8: the acceptance runner must (1) run in an injected cwd, (2) honour
 * quotes and pipes, and (3) on timeout kill the WHOLE process group so no
 * descendant outlives the criterion. These use plain POSIX commands so
 * they run under vitest without a Bun global (unlike the integration spec).
 */

import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
	runAcceptanceCriteria,
	tokenizeArgv,
	commandNeedsShell,
} from '@mcp-vertex/proposals/lib/proposals/proposal-acceptance';

describe('tokenizeArgv (M8 quote-aware parser)', () => {
	it('keeps a double-quoted argument with spaces as one token', () => {
		expect(tokenizeArgv('printf "a b" c')).toEqual(['printf', 'a b', 'c']);
	});
	it('keeps a single-quoted argument as one token', () => {
		expect(tokenizeArgv("echo 'one two'")).toEqual(['echo', 'one two']);
	});
	it('handles backslash escapes outside quotes', () => {
		expect(tokenizeArgv('echo a\\ b')).toEqual(['echo', 'a b']);
	});
	it('collapses runs of whitespace', () => {
		expect(tokenizeArgv('  echo    hi  ')).toEqual(['echo', 'hi']);
	});
});

describe('commandNeedsShell (M8)', () => {
	it('is false for a plain command (even with quotes)', () => {
		expect(commandNeedsShell('echo "a b"')).toBe(false);
		expect(commandNeedsShell('printf hi')).toBe(false);
	});
	it('is true for pipes, redirects, chaining and subshells', () => {
		expect(commandNeedsShell('echo hi | grep hi')).toBe(true);
		expect(commandNeedsShell('echo hi > /tmp/x')).toBe(true);
		expect(commandNeedsShell('a && b')).toBe(true);
		expect(commandNeedsShell('echo $(date)')).toBe(true);
	});
});

describe('runAcceptanceCriteria — M8 exec semantics', () => {
	let dir = '';
	beforeEach(() => {
		dir = mkdtempSync(join(tmpdir(), 'accept-exec-'));
	});
	afterEach(() => rmSync(dir, { recursive: true, force: true }));

	it('runs the command in the injected cwd', async () => {
		const marker = dir.split('/').pop()!;
		const res = await runAcceptanceCriteria(
			[{ command: 'pwd', expect: `contains:${marker}` }],
			{ cwd: dir },
		);
		expect(res.allPassed).toBe(true);
		expect(res.results[0]?.actual).toContain(marker);
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
		// It returned because of the kill, not because sleep finished.
		expect(Date.now() - startedAt).toBeLessThan(3000);
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
});

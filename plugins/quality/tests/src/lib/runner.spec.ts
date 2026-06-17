/**
 * runner.spec.ts (M10/H4)
 *
 * Branch coverage for the real command runner: success, non-zero exit,
 * timeout→SIGKILL (code 124), and spawn error (code 127). These exercise the
 * `spawn` paths the single happy-path spec did not.
 */
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
	createCommandRunner,
	runScope,
	type ICommandRunner,
} from '@cartago-git/mcp-quality/lib/runner';

describe('createCommandRunner (real spawn)', () => {
	let cwd = '';
	beforeEach(() => {
		cwd = mkdtempSync(join(tmpdir(), 'quality-run-'));
	});
	afterEach(() => rmSync(cwd, { recursive: true, force: true }));

	it('captures output and reports code 0 on success', async () => {
		const run = createCommandRunner();
		const out = await run('echo hello-quality', cwd);
		expect(out.code).toBe(0);
		expect(out.timedOut).toBe(false);
		expect(out.output).toContain('hello-quality');
	});

	it('reports a non-zero exit code without throwing', async () => {
		const run = createCommandRunner();
		const out = await run('exit 3', cwd);
		expect(out.code).toBe(3);
		expect(out.timedOut).toBe(false);
	});

	it('kills a runaway command on timeout and reports code 124', async () => {
		const run = createCommandRunner(50); // 50ms budget
		const out = await run('sleep 10', cwd);
		expect(out.timedOut).toBe(true);
		expect(out.code).toBe(124);
	});

	it('reports code 127 when the process cannot be spawned (bad cwd)', async () => {
		const run = createCommandRunner();
		const out = await run('echo nope', join(cwd, 'does-not-exist'));
		expect(out.code).toBe(127);
		expect(out.timedOut).toBe(false);
	});
});

describe('runScope', () => {
	it('surfaces a timed-out command and marks the scope not-ok', async () => {
		const fakeRunner: ICommandRunner = async (command) =>
			command.includes('slow')
				? { code: 124, output: 'killed', timedOut: true }
				: { code: 0, output: 'ok', timedOut: false };
		const result = await runScope(
			'type',
			[{ command: 'tsc' }, { command: 'slow-thing' }],
			'/ws',
			fakeRunner
		);
		expect(result.ok).toBe(false);
		const slow = result.results.find((r) => r.command === 'slow-thing');
		expect(slow?.timedOut).toBe(true);
		expect(slow?.code).toBe(124);
	});
});

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
	activeRunPids,
	cancelActiveRuns,
	createCommandRunner,
	runScope,
	type ICommandRunner,
} from '@mcp-vertex/quality/lib/runner';

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

	it('cancelActiveRuns aborts an in-flight command without waiting for the timeout', async () => {
		const run = createCommandRunner(30_000); // long budget: only cancel ends it
		const pending = run('sleep 30', cwd);
		// Wait until the child is registered as active.
		await new Promise((r) => setTimeout(r, 150));
		expect(activeRunPids().length).toBeGreaterThanOrEqual(1);
		const killed = cancelActiveRuns();
		expect(killed.length).toBeGreaterThanOrEqual(1);
		const out = await pending; // resolves because the group was killed
		expect(out.timedOut).toBe(false);
		expect(activeRunPids()).toHaveLength(0);
	}, 10_000);

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
			[
				{ command: 'tsc', expect: 'exit0' },
				{ command: 'slow-thing', expect: 'exit0' },
			],
			'/ws',
			fakeRunner,
		);
		expect(result.ok).toBe(false);
		const slow = result.results.find((r) => r.command === 'slow-thing');
		expect(slow?.timedOut).toBe(true);
		expect(slow?.code).toBe(124);
	});
});

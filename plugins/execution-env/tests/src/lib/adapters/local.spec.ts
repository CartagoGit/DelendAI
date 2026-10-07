import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { LocalExecutionEnvironment } from '../../../../src/lib/adapters/local.service';
import { FakeProcessRunner } from './fake-process-runner';

let root = '';
beforeEach(async () => {
	root = await mkdtemp(join(tmpdir(), 'exec-env-local-'));
});
afterEach(async () => {
	await rm(root, { recursive: true, force: true });
});

describe('LocalExecutionEnvironment', () => {
	it('prepares and tears down without doing anything', async () => {
		const env = new LocalExecutionEnvironment({
			workspaceRoot: root,
			runner: new FakeProcessRunner(),
		});
		expect((await env.prepare()).ok).toBe(true);
		expect((await env.teardown()).ok).toBe(true);
	});

	it('hands the argument vector to the runner untouched, in the workspace', async () => {
		const runner = new FakeProcessRunner([
			{ exitCode: 0, stdout: 'out', stderr: '' },
		]);
		const env = new LocalExecutionEnvironment({
			workspaceRoot: root,
			runner,
			baseEnv: { PATH: '/bin' },
		});
		const result = await env.exec(['git', 'log', '--', 'a b; rm'], {
			env: { EXTRA: '1' },
			stdin: 'in',
		});
		expect(result.stdout).toBe('out');
		expect(result.dryRun).toBe(false);
		expect(runner.calls).toHaveLength(1);
		expect(runner.calls[0]?.argv).toEqual(['git', 'log', '--', 'a b; rm']);
		expect(runner.calls[0]?.options).toMatchObject({
			cwd: root,
			env: { PATH: '/bin', EXTRA: '1' },
			stdin: 'in',
		});
	});

	it('plans without running in a dry run', async () => {
		const runner = new FakeProcessRunner();
		const env = new LocalExecutionEnvironment({
			workspaceRoot: root,
			runner,
			dryRun: true,
		});
		const result = await env.exec(['echo', 'x']);
		expect(result).toMatchObject({
			dryRun: true,
			plannedArgv: ['echo', 'x'],
		});
		expect(runner.calls).toHaveLength(0);
	});

	it('shows the environment with secrets hidden but runs with the real values', async () => {
		const runner = new FakeProcessRunner();
		const env = new LocalExecutionEnvironment({
			workspaceRoot: root,
			runner,
			baseEnv: { PATH: '/bin', API_TOKEN: 'real' },
		});
		expect(await env.env()).toEqual({
			PATH: '/bin',
			API_TOKEN: '[redacted]',
		});
		await env.exec(['true']);
		expect(runner.calls[0]?.options?.env).toMatchObject({
			API_TOKEN: 'real',
		});
	});

	it('promises persistence but no isolation', () => {
		const caps = new LocalExecutionEnvironment({
			workspaceRoot: root,
		}).capabilities();
		expect(caps).toContain('persistent-workspace');
		expect(caps).not.toContain('isolated-filesystem');
		expect(caps).not.toContain('isolated-network');
	});

	it('writes and reads a file inside the workspace', async () => {
		const env = new LocalExecutionEnvironment({ workspaceRoot: root });
		await env.putFile('notes/a.txt', 'hello');
		expect(await readFile(join(root, 'notes/a.txt'), 'utf8')).toBe('hello');
		expect(await env.getFile('notes/a.txt')).toBe('hello');
	});

	it('refuses a path that leaves the workspace', async () => {
		const env = new LocalExecutionEnvironment({ workspaceRoot: root });
		await expect(env.putFile('../escape.txt', 'x')).rejects.toThrow(
			'leaves the workspace',
		);
	});

	it('does not write in a dry run', async () => {
		const env = new LocalExecutionEnvironment({
			workspaceRoot: root,
			dryRun: true,
		});
		await env.putFile('a.txt', 'x');
		await expect(readFile(join(root, 'a.txt'), 'utf8')).rejects.toThrow();
	});
});

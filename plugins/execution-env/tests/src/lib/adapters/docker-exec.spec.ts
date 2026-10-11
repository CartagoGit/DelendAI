import { describe, expect, it } from 'vitest';

import { DockerExecExecutionEnvironment } from '../../../../src/lib/adapters/docker-exec.service';
import type { IDockerExecOptions } from '../../../../src/lib/contracts/interfaces/docker-exec-execution.interface';
import { FakeProcessRunner } from './fake-process-runner';

const build = (
	runner: FakeProcessRunner,
	options: Partial<IDockerExecOptions> = {},
): DockerExecExecutionEnvironment =>
	new DockerExecExecutionEnvironment({
		container: 'sidecar',
		runner,
		...options,
	});

describe('DockerExecExecutionEnvironment', () => {
	it('resolves the container by name and confirms it is running', async () => {
		const runner = new FakeProcessRunner([
			{ exitCode: 0, stdout: 'true\n', stderr: '' },
		]);
		expect((await build(runner).prepare()).ok).toBe(true);
		expect(runner.calls[0]?.argv).toEqual([
			'docker',
			'inspect',
			'--format={{.State.Running}}',
			'--',
			'sidecar',
		]);
	});

	it('accepts a container id', () => {
		expect(() =>
			build(new FakeProcessRunner(), { container: '3f4ab9c1d2e0' }),
		).not.toThrow();
	});

	it('reports a stopped container and a missing one', async () => {
		const stopped = await build(
			new FakeProcessRunner([
				{ exitCode: 0, stdout: 'false\n', stderr: '' },
			]),
		).prepare();
		expect(stopped).toMatchObject({ ok: false });
		expect(stopped.reason).toContain('not running');
		const missing = await build(
			new FakeProcessRunner([
				{
					exitCode: 1,
					stdout: '',
					stderr: 'No such object: sidecar\n',
				},
			]),
		).prepare();
		expect(missing.reason).toBe('No such object: sidecar');
	});

	it('refuses a container reference that could be an option', () => {
		expect(() =>
			build(new FakeProcessRunner(), { container: '--privileged' }),
		).toThrow('not a valid container');
	});

	it('execs as the requested user with the command after --', async () => {
		const runner = new FakeProcessRunner();
		await build(runner, { user: 'root', workdir: '/srv' }).exec(
			['ls', '--', '-l'],
			{ env: { A: '1' } },
		);
		expect(runner.calls[0]?.argv).toEqual([
			'docker',
			'exec',
			'--user=root',
			'--workdir=/srv',
			'--env=A=1',
			'--',
			'sidecar',
			'ls',
			'--',
			'-l',
		]);
	});

	it('reads the container environment through inspect', async () => {
		const runner = new FakeProcessRunner([
			{
				exitCode: 0,
				stdout: JSON.stringify(['HOME=/root', 'DB_PASSWORD=x']),
				stderr: '',
			},
		]);
		expect(await build(runner).env()).toEqual({
			HOME: '/root',
			DB_PASSWORD: '[redacted]',
		});
	});

	it('does not stop or remove the container at teardown', async () => {
		const runner = new FakeProcessRunner();
		expect((await build(runner).teardown()).ok).toBe(true);
		expect(runner.calls).toHaveLength(0);
	});

	it('plans without running in a dry run', async () => {
		const runner = new FakeProcessRunner();
		const env = build(runner, { dryRun: true });
		expect((await env.prepare()).dryRun).toBe(true);
		expect((await env.exec(['true'])).dryRun).toBe(true);
		expect(runner.calls).toHaveLength(0);
	});

	it('moves files through exec', async () => {
		const runner = new FakeProcessRunner([
			{ exitCode: 0, stdout: '', stderr: '' },
			{ exitCode: 0, stdout: 'x', stderr: '' },
		]);
		const env = build(runner);
		await env.putFile('/tmp/f', 'x');
		expect(await env.getFile('/tmp/f')).toBe('x');
	});
});

import { describe, expect, it } from 'vitest';

import { DockerCliExecutionEnvironment } from '../../../../src/lib/adapters/docker-cli.service';
import type { IDockerCliOptions } from '../../../../src/lib/contracts/interfaces/docker-cli-execution.interface';
import { FakeProcessRunner } from './fake-process-runner';

const build = (
	runner: FakeProcessRunner,
	options: Partial<IDockerCliOptions> = {},
): DockerCliExecutionEnvironment =>
	new DockerCliExecutionEnvironment({
		image: 'node:22',
		containerName: 'box',
		runner,
		...options,
	});

describe('DockerCliExecutionEnvironment defaults', () => {
	it('starts a container with no network, a non-root user and cleanup, and mounts nothing', async () => {
		const runner = new FakeProcessRunner();
		const result = await build(runner).prepare();
		expect(result.ok).toBe(true);
		expect(runner.calls[0]?.argv).toEqual([
			'docker',
			'run',
			'--detach',
			'--name=box',
			'--network=none',
			'--user=1000:1000',
			'--rm',
			'--',
			'node:22',
			'sleep',
			'infinity',
		]);
	});

	it('mounts the workspace only when it is listed, read-only unless said otherwise', async () => {
		const runner = new FakeProcessRunner();
		await build(runner, {
			mounts: [
				{ hostPath: '/repo', containerPath: '/work' },
				{ hostPath: '/out', containerPath: '/out', readOnly: false },
			],
		}).prepare();
		const argv = runner.calls[0]?.argv ?? [];
		expect(argv).toContain(
			'--mount=type=bind,source=/repo,target=/work,readonly',
		);
		expect(argv).toContain('--mount=type=bind,source=/out,target=/out');
	});

	it('uses the form that keeps a dash-leading value from becoming an option', async () => {
		const runner = new FakeProcessRunner();
		await build(runner, { network: '-evil', image: '-image' }).prepare();
		const argv = runner.calls[0]?.argv ?? [];
		expect(argv).toContain('--network=-evil');
		expect(argv.indexOf('--')).toBeLessThan(argv.indexOf('-image'));
	});

	it('keeps the container when cleanup is never', async () => {
		const runner = new FakeProcessRunner();
		const env = build(runner, { cleanupOnExit: 'never' });
		await env.prepare();
		expect(runner.calls[0]?.argv).not.toContain('--rm');
		const torn = await env.teardown();
		expect(torn.ok).toBe(true);
		expect(runner.calls).toHaveLength(1);
	});

	it('removes the container at teardown by default', async () => {
		const runner = new FakeProcessRunner();
		await build(runner).teardown();
		expect(runner.calls[0]?.argv).toEqual([
			'docker',
			'rm',
			'--force',
			'--',
			'box',
		]);
	});

	it('generates a unique name when none is given', async () => {
		const runner = new FakeProcessRunner();
		const suffixes = ['s1', 's2'];
		const make = () =>
			new DockerCliExecutionEnvironment({
				image: 'a',
				runner,
				nameSuffix: () => suffixes.shift() ?? 'none',
			});
		await make().prepare();
		await make().prepare();
		const names = runner.calls.map((c) => c.argv[3]);
		expect(names).toEqual([
			'--name=delendai-env-s1',
			'--name=delendai-env-s2',
		]);
	});

	it("reports a failed start with docker's own reason", async () => {
		const runner = new FakeProcessRunner([
			{ exitCode: 125, stdout: '', stderr: 'pull access denied\n' },
		]);
		const result = await build(runner).prepare();
		expect(result).toMatchObject({
			ok: false,
			reason: 'pull access denied',
		});
	});
});

describe('DockerCliExecutionEnvironment capabilities', () => {
	it('is isolated in the filesystem always and in the network only for none', () => {
		const runner = new FakeProcessRunner();
		expect(build(runner).capabilities()).toEqual(
			expect.arrayContaining(['isolated-filesystem', 'isolated-network']),
		);
		const open = build(runner, { network: 'bridge' }).capabilities();
		expect(open).toContain('isolated-filesystem');
		expect(open).not.toContain('isolated-network');
	});

	it('promises a persistent workspace only for a writable mount', () => {
		const runner = new FakeProcessRunner();
		expect(build(runner).capabilities()).not.toContain(
			'persistent-workspace',
		);
		expect(
			build(runner, {
				mounts: [
					{ hostPath: '/r', containerPath: '/w', readOnly: false },
				],
			}).capabilities(),
		).toContain('persistent-workspace');
	});
});

describe('DockerCliExecutionEnvironment refusals', () => {
	it('refuses to mount the docker socket unless explicitly allowed', () => {
		const runner = new FakeProcessRunner();
		const mounts = [
			{
				hostPath: '/var/run/docker.sock',
				containerPath: '/var/run/docker.sock',
			},
		];
		expect(() => build(runner, { mounts })).toThrow('allowDockerSocket');
		expect(() =>
			build(runner, { mounts, allowDockerSocket: true }),
		).not.toThrow();
	});

	it('refuses a mount path that would break out of its option', () => {
		const runner = new FakeProcessRunner();
		expect(() =>
			build(runner, {
				mounts: [{ hostPath: '/a,source=/etc', containerPath: '/w' }],
			}),
		).toThrow('commas');
	});

	it('refuses an empty image', () => {
		expect(() => build(new FakeProcessRunner(), { image: ' ' })).toThrow(
			'needs an image',
		);
	});
});

describe('DockerCliExecutionEnvironment exec', () => {
	it('puts the command after -- so data cannot become an option', async () => {
		const runner = new FakeProcessRunner([
			{ exitCode: 0, stdout: 'x', stderr: '' },
		]);
		const result = await build(runner).exec(['ls', '-la', '--', '-rf'], {
			cwd: '/work',
			env: { A: '1' },
		});
		expect(result.stdout).toBe('x');
		expect(runner.calls[0]?.argv).toEqual([
			'docker',
			'exec',
			'--workdir=/work',
			'--env=A=1',
			'--',
			'box',
			'ls',
			'-la',
			'--',
			'-rf',
		]);
	});

	it('plans without running in a dry run', async () => {
		const runner = new FakeProcessRunner();
		const env = build(runner, { dryRun: true });
		const prepared = await env.prepare();
		const ran = await env.exec(['true']);
		const torn = await env.teardown();
		expect(prepared.dryRun).toBe(true);
		expect(ran.dryRun).toBe(true);
		expect(torn.plannedArgv?.[0]).toContain('rm');
		expect(runner.calls).toHaveLength(0);
	});
});

describe('DockerCliExecutionEnvironment files', () => {
	it('writes through stdin and passes the path as a positional parameter', async () => {
		const runner = new FakeProcessRunner();
		await build(runner).putFile('/work/-odd; name', 'body');
		const call = runner.calls[0];
		expect(call?.argv.slice(-5)).toEqual([
			'sh',
			'-c',
			'mkdir -p -- "$(dirname -- "$1")" && cat > "$1"',
			'sh',
			'/work/-odd; name',
		]);
		expect(call?.options?.stdin).toBe('body');
	});

	it('reads with cat after --', async () => {
		const runner = new FakeProcessRunner([
			{ exitCode: 0, stdout: 'contents', stderr: '' },
		]);
		expect(await build(runner).getFile('/work/a')).toBe('contents');
		expect(runner.calls[0]?.argv.slice(-3)).toEqual([
			'cat',
			'--',
			'/work/a',
		]);
	});

	it('throws with the reason when the container cannot read the file', async () => {
		const runner = new FakeProcessRunner([
			{ exitCode: 1, stdout: '', stderr: 'no such file' },
		]);
		await expect(build(runner).getFile('/x')).rejects.toThrow(
			'no such file',
		);
	});
});

describe('DockerCliExecutionEnvironment env', () => {
	it('reads the container environment through inspect, hiding secrets', async () => {
		const runner = new FakeProcessRunner([
			{
				exitCode: 0,
				stdout: JSON.stringify(['PATH=/bin', 'API_TOKEN=abc=def']),
				stderr: '',
			},
		]);
		expect(await build(runner).env()).toEqual({
			PATH: '/bin',
			API_TOKEN: '[redacted]',
		});
		expect(runner.calls[0]?.argv).toEqual([
			'docker',
			'inspect',
			'--format={{json .Config.Env}}',
			'--',
			'box',
		]);
	});
});

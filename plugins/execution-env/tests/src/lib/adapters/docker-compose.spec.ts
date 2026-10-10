import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { DockerComposeExecutionEnvironment } from '../../../../src/lib/adapters/docker-compose.service';
import type { IComposeExecutionOptions } from '../../../../src/lib/contracts/interfaces/compose-execution.interface';
import { FakeProcessRunner } from './fake-process-runner';

const COMPOSE = `
services:
  web:
    image: node:22
    environment:
      MODE: test
      API_TOKEN: abc
    mem_limit: 512m
    cpus: 1
  bare:
    image: alpine
`;

let root = '';
beforeEach(async () => {
	root = await mkdtemp(join(tmpdir(), 'exec-env-compose-'));
	await writeFile(join(root, 'compose.yaml'), COMPOSE);
});
afterEach(async () => {
	await rm(root, { recursive: true, force: true });
});

const build = (
	runner: FakeProcessRunner,
	options: Partial<IComposeExecutionOptions> = {},
): DockerComposeExecutionEnvironment =>
	new DockerComposeExecutionEnvironment({
		workspaceRoot: root,
		composeFile: 'compose.yaml',
		service: 'web',
		runner,
		...options,
	});

describe('DockerComposeExecutionEnvironment prepare', () => {
	it('reads the file and exposes the service', async () => {
		const env = build(new FakeProcessRunner());
		expect((await env.prepare()).ok).toBe(true);
		expect(env.service()?.image).toBe('node:22');
	});

	it('names the services that exist when the requested one does not', async () => {
		const result = await build(new FakeProcessRunner(), {
			service: 'missing',
		}).prepare();
		expect(result.ok).toBe(false);
		expect(result.reason).toContain('services: web, bare');
	});

	it('fails when the file is not there', async () => {
		const result = await build(new FakeProcessRunner(), {
			composeFile: 'nope.yaml',
		}).prepare();
		expect(result.ok).toBe(false);
	});

	it('requires declared limits at or below the ceiling', async () => {
		const runner = new FakeProcessRunner();
		const within = await build(runner, {
			requireLimits: { memoryBytes: 1024 ** 3, cpus: 2 },
		}).prepare();
		expect(within.ok).toBe(true);
		const tooBig = await build(runner, {
			requireLimits: { memoryBytes: 1024 ** 2 },
		}).prepare();
		expect(tooBig.reason).toContain('memory limit');
		const undeclared = await build(runner, {
			service: 'bare',
			requireLimits: { cpus: 1 },
		}).prepare();
		expect(undeclared.reason).toContain('cpus');
	});

	it('starts no process', async () => {
		const runner = new FakeProcessRunner();
		await build(runner).prepare();
		expect(runner.calls).toHaveLength(0);
	});
});

describe('DockerComposeExecutionEnvironment exec', () => {
	it('runs the command through bash -lc with the arguments as positional parameters', async () => {
		const runner = new FakeProcessRunner([
			{ exitCode: 0, stdout: 'ok', stderr: '' },
		]);
		const result = await build(runner, {
			projectName: 'proj',
			workdir: '/app',
			passEnv: ['NPM_TOKEN'],
		}).exec(['echo', '$(rm -rf /)', '--', '-x'], { env: { A: '1' } });
		expect(result.stdout).toBe('ok');
		expect(runner.calls[0]?.argv).toEqual([
			'docker',
			'compose',
			`--file=${root}/compose.yaml`,
			'--project-name=proj',
			'run',
			'--rm',
			'-T',
			'--no-deps',
			'--workdir=/app',
			'--env=NPM_TOKEN',
			'--env=A=1',
			'--',
			'web',
			'bash',
			'-lc',
			'exec "$@"',
			'bash',
			'echo',
			'$(rm -rf /)',
			'--',
			'-x',
		]);
		expect(runner.calls[0]?.options?.cwd).toBe(root);
	});

	it('starts dependencies only when asked', async () => {
		const runner = new FakeProcessRunner();
		await build(runner, { withDependencies: true }).exec(['true']);
		expect(runner.calls[0]?.argv).not.toContain('--no-deps');
	});

	it('prefers the per-call directory and switches user', async () => {
		const runner = new FakeProcessRunner();
		await build(runner, { workdir: '/app', user: 'node' }).exec(['true'], {
			cwd: '/tmp',
		});
		const argv = runner.calls[0]?.argv ?? [];
		expect(argv).toContain('--workdir=/tmp');
		expect(argv).not.toContain('--workdir=/app');
		expect(argv).toContain('--user=node');
	});

	it('plans without running in a dry run', async () => {
		const runner = new FakeProcessRunner();
		const result = await build(runner, { dryRun: true }).exec(['true']);
		expect(result.dryRun).toBe(true);
		expect(runner.calls).toHaveLength(0);
	});

	it('refuses a compose file outside the workspace', async () => {
		const env = build(new FakeProcessRunner(), {
			composeFile: '../outside.yaml',
		});
		await expect(env.exec(['true'])).rejects.toThrow(
			'leaves the workspace',
		);
	});
});

describe('DockerComposeExecutionEnvironment env and files', () => {
	it('shows what the service declares with secrets hidden, and forwarded names', async () => {
		const env = await build(new FakeProcessRunner(), {
			passEnv: ['NPM_TOKEN', 'LANG'],
		}).env();
		expect(env).toEqual({
			MODE: 'test',
			API_TOKEN: '[redacted]',
			NPM_TOKEN: '[redacted]',
			LANG: '',
		});
	});

	it('moves files through the service', async () => {
		const runner = new FakeProcessRunner([
			{ exitCode: 0, stdout: '', stderr: '' },
			{ exitCode: 0, stdout: 'data', stderr: '' },
		]);
		const env = build(runner);
		await env.putFile('/app/a.txt', 'data');
		expect(runner.calls[0]?.options?.stdin).toBe('data');
		expect(await env.getFile('/app/a.txt')).toBe('data');
		expect(runner.calls[1]?.argv.slice(-3)).toEqual([
			'cat',
			'--',
			'/app/a.txt',
		]);
	});

	it('has nothing to release at teardown', async () => {
		const runner = new FakeProcessRunner();
		expect((await build(runner).teardown()).ok).toBe(true);
		expect(runner.calls).toHaveLength(0);
	});
});

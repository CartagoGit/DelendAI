import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import type { IArgvExec, IProbeDeps } from '@delendai/core/contracts';
import { runInExecutionRoot } from '@delendai/core/lib/shared/execution-root';
import { createFakeToolServer } from '@delendai/test-kit';

import { buildContainerDockerToolRegistrations } from './container-docker.tool';

type IHandler = (
	args: unknown,
) => Promise<{ content: Array<{ text: string }> }>;

const probe: IProbeDeps = {
	commandExists: async () => true,
	runVersion: async () => 'Docker version 29.0.0',
};

const mount = async (
	root: string,
	answer: (argv: readonly string[]) => number = () => 0,
) => {
	const calls: (readonly string[])[] = [];
	const runExec: IArgvExec = async (argv) => {
		calls.push(argv);
		return {
			code: answer(argv),
			stdout: 'out',
			stderr: '',
			timedOut: false,
		};
	};
	const tools: Record<string, IHandler> = {};
	const server = createFakeToolServer({
		onRegisterTool: ({ name, handler }) => {
			tools[name] = handler as IHandler;
		},
	});
	for (const registration of buildContainerDockerToolRegistrations({
		namespacePrefix: 'c',
		workspaceRootAbs: root,
		deps: { probeDeps: probe, runExec },
	}))
		await registration.register(server);
	const call = async (name: string, args: unknown) =>
		JSON.parse(
			(await (tools[`c_${name}`] as IHandler)(args)).content[0]?.text ??
				'{}',
		) as Record<string, unknown>;
	return { call, calls, names: Object.keys(tools).sort() };
};

describe('container docker tools', () => {
	const roots: string[] = [];
	afterEach(() => {
		for (const root of roots.splice(0))
			rmSync(root, { recursive: true, force: true });
	});
	const root = (): string => {
		const dir = mkdtempSync(join(tmpdir(), 'docker-tools-'));
		roots.push(dir);
		return dir;
	};

	it('registers pull, run, exec, compose, network and volume', async () => {
		expect((await mount(root())).names).toEqual([
			'c_container_compose',
			'c_container_exec',
			'c_container_network',
			'c_container_pull',
			'c_container_run',
			'c_container_volume',
		]);
	});

	it('runs nothing that changes something without confirm, and shows it on dryRun', async () => {
		const { call, calls } = await mount(root());
		expect(
			await call('container_exec', { container: 'web', command: ['ls'] }),
		).toMatchObject({
			ok: false,
			reason: 'mutation requires confirm: true',
		});
		expect(
			await call('container_exec', {
				container: 'web',
				command: ['ls'],
				dryRun: true,
			}),
		).toEqual({ ok: 'dry-run', command: 'docker exec web ls' });
		expect(calls).toEqual([]);
	});

	it('a container that reaches the host needs confirmRisk, which confirm never implies', async () => {
		const { call, calls } = await mount(root());
		const risky = {
			image: 'alpine',
			privileged: true,
			mounts: ['/var/run/docker.sock:/var/run/docker.sock'],
			network: 'host',
			confirm: true,
		};
		const refused = await call('container_run', risky);
		expect(refused.ok).toBe(false);
		expect(String(refused.reason)).toContain('privileged');
		expect(String(refused.reason)).toContain('docker socket');
		expect(String(refused.reason)).toContain("host's network");
		expect(calls).toEqual([]);
		expect(
			await call('container_run', { ...risky, confirmRisk: true }),
		).toMatchObject({ ok: true });
		expect(calls[0]).toContain('--privileged');
	});

	it('pulls only a missing image under the default policy', async () => {
		const present = await mount(root(), () => 0);
		expect(
			await present.call('container_pull', {
				image: 'alpine:3',
				confirm: true,
			}),
		).toMatchObject({ skipped: 'present' });
		const missing = await mount(root(), (argv) =>
			argv.includes('inspect') ? 1 : 0,
		);
		expect(
			await missing.call('container_pull', {
				image: 'alpine:3',
				confirm: true,
			}),
		).toMatchObject({ ok: true, command: 'docker pull alpine:3' });
	});

	it("works in the caller's checkout, not the server's root", async () => {
		const served = root();
		const unit = root();
		writeFileSync(
			join(unit, 'compose.yaml'),
			'services:\n  web:\n    image: nginx\n',
		);
		const { call } = await mount(served);
		expect(
			await call('container_compose', { action: 'services' }),
		).toMatchObject({
			ok: false,
		});
		expect(
			await runInExecutionRoot(unit, () =>
				call('container_compose', { action: 'services' }),
			),
		).toMatchObject({ ok: true, file: 'compose.yaml' });
	});

	it('reads the compose file, starts one service unless told all, and refuses an unknown one', async () => {
		const dir = root();
		writeFileSync(
			join(dir, 'compose.yaml'),
			'services:\n  web:\n    image: nginx\n    ports: ["8080:80"]\n    environment:\n      API_KEY: secret\n  db:\n    image: postgres\n',
		);
		const { call, calls } = await mount(dir);
		expect(await call('container_compose', { action: 'services' })).toEqual(
			{
				ok: true,
				file: 'compose.yaml',
				services: [
					{
						name: 'web',
						image: 'nginx',
						ports: ['8080:80'],
						environment: ['API_KEY'],
						mounts: [],
					},
					{
						name: 'db',
						image: 'postgres',
						ports: [],
						environment: [],
						mounts: [],
					},
				],
			},
		);
		expect(
			await call('container_compose', { action: 'up', confirm: true }),
		).toMatchObject({ ok: false });
		expect(
			await call('container_compose', {
				action: 'up',
				service: 'nope',
				confirm: true,
			}),
		).toMatchObject({ ok: false });
		expect(
			await call('container_compose', {
				action: 'up',
				service: 'web',
				confirm: true,
			}),
		).toMatchObject({ ok: true });
		expect(calls.at(-1)).toEqual([
			'docker',
			'compose',
			'-f',
			'compose.yaml',
			'up',
			'-d',
			'web',
		]);
		expect(await call('container_compose', { action: 'ps' })).toMatchObject(
			{ ok: true },
		);
	});

	it('refuses compose without a compose file, and runs logs, down and exec on it', async () => {
		expect(
			await (await mount(root())).call('container_compose', {
				action: 'ps',
			}),
		).toMatchObject({
			ok: false,
			reason: 'no compose file at the workspace root',
		});
		const dir = root();
		writeFileSync(
			join(dir, 'docker-compose.yml'),
			'services:\n  web:\n    image: nginx\n',
		);
		const { call, calls } = await mount(dir);
		expect(
			await call('container_compose', {
				action: 'logs',
				service: 'web',
				tail: 5,
			}),
		).toMatchObject({ ok: true });
		expect(calls.at(-1)).toEqual([
			'docker',
			'compose',
			'-f',
			'docker-compose.yml',
			'logs',
			'--no-color',
			'--tail',
			'5',
			'web',
		]);
		expect(
			await call('container_compose', { action: 'down', confirm: true }),
		).toMatchObject({ ok: true });
		expect(
			await call('container_compose', {
				action: 'exec',
				service: 'web',
				command: ['ls'],
				confirm: true,
			}),
		).toMatchObject({ ok: true });
		expect(calls.at(-1)).toEqual([
			'docker',
			'compose',
			'-f',
			'docker-compose.yml',
			'exec',
			'-T',
			'web',
			'ls',
		]);
		expect(
			await call('container_exec', {
				container: 'web',
				command: ['ls'],
				confirm: true,
			}),
		).toMatchObject({ ok: true });
	});

	it('creates and removes networks and volumes only with confirm', async () => {
		const { call } = await mount(root());
		expect(await call('container_network', { action: 'ls' })).toMatchObject(
			{ ok: true },
		);
		expect(
			await call('container_volume', { action: 'rm', name: 'data' }),
		).toMatchObject({ ok: false });
		expect(await call('container_volume', { action: 'rm' })).toMatchObject({
			ok: false,
			reason: 'rm names one volume',
		});
		expect(
			await call('container_volume', {
				action: 'create',
				name: 'data',
				confirm: true,
			}),
		).toMatchObject({ ok: true });
	});
});

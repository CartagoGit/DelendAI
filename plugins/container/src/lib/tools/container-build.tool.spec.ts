import { describe, expect, it } from 'vitest';

import type { IArgvExec, IProbeDeps } from '@delendai/core/public';

import { buildContainerBuildToolRegistrations } from './container-build.tool';

const mountHandlers = async (probeDeps: IProbeDeps, runExec: IArgvExec) => {
	const registrations = buildContainerBuildToolRegistrations({
		namespacePrefix: 'container',
		probeDeps,
		runExec,
	});
	const tools: Record<
		string,
		(args: unknown) => Promise<{ content: Array<{ text: string }> }>
	> = {};
	const server = {
		tools,
		registerTool: (
			name: string,
			_meta: unknown,
			handler: (
				args: unknown,
			) => Promise<{ content: Array<{ text: string }> }>,
		) => {
			tools[name] = handler;
			return { dispose: () => undefined } as never;
		},
	};
	for (const r of registrations) {
		await r.register(server as never);
	}
	const build = tools.container_container_build;
	const apply = tools.container_k8s_apply;
	if (build === undefined || apply === undefined) {
		throw new Error('container build/apply handlers were not registered');
	}
	return { build, apply };
};

const probeDepsAvailable = (bin: string): IProbeDeps => ({
	commandExists: async (b: string) => b === bin,
	runVersion: async () => '1.0.0',
});

const probeDepsMissing: IProbeDeps = {
	commandExists: async () => false,
	runVersion: async () => '',
};

const execWith = (stdout: string, code = 0): IArgvExec => {
	const calls: { argv: readonly string[]; stdin?: string | undefined }[] = [];
	const fn: IArgvExec = async (argv, options) => {
		calls.push({ argv, stdin: options?.stdin });
		return { code, stdout, stderr: '', timedOut: false };
	};
	(fn as unknown as { calls: typeof calls }).calls = calls;
	return fn;
};

const parseBody = (raw: unknown): Record<string, unknown> => {
	const content = (raw as { content: Array<{ text: string }> }).content;
	return JSON.parse(content[0]?.text ?? '{}') as Record<string, unknown>;
};

describe('f00133 S3 container-build tool', () => {
	it('container_build refuses without confirm', async () => {
		const { build } = await mountHandlers(
			probeDepsAvailable('docker'),
			execWith(''),
		);
		const body = parseBody(await build({ tag: 'app:1' }));
		expect(body.ok).toBe(false);
		expect(body.reason).toContain('confirm');
	});

	it('container_build dryRun previews the argv without exec', async () => {
		const exec = execWith('');
		const { build } = await mountHandlers(
			probeDepsAvailable('docker'),
			exec,
		);
		const body = parseBody(await build({ tag: 'app:1', dryRun: true }));
		expect(body.ok).toBe('dry-run');
		expect(body.command).toContain('docker build');
		expect((exec as unknown as { calls: unknown[] }).calls.length).toBe(0);
	});

	it('container_build runs docker with confirm: true', async () => {
		const stdout =
			'#1 [internal] load build definition from Dockerfile\nsha256:abc123def456\n';
		const exec = execWith(stdout);
		const { build } = await mountHandlers(
			probeDepsAvailable('docker'),
			exec,
		);
		const body = parseBody(await build({ tag: 'app:1', confirm: true }));
		expect(body.ok).toBe(true);
		expect(body.imageId).toBe('sha256:abc123def456');
		expect(body.command).toBe('docker build -t app:1 .');
	});

	it('container_build returns install-missing when docker is absent', async () => {
		const { build } = await mountHandlers(
			probeDepsMissing,
			execWith('', 127),
		);
		const body = parseBody(await build({ tag: 'app:1', confirm: true }));
		const err = body.error as { reason?: string } | undefined;
		expect(body.ok).toBe(false);
		expect(err?.reason).toBe('install-missing');
	});

	it('k8s_apply refuses without confirm', async () => {
		const { apply } = await mountHandlers(
			probeDepsAvailable('kubectl'),
			execWith(''),
		);
		const body = parseBody(
			await apply({ manifest: 'apiVersion: v1\nkind: Pod\n' }),
		);
		expect(body.ok).toBe(false);
		expect(body.reason).toContain('confirm');
	});

	it('k8s_apply dryRun previews the argv', async () => {
		const exec = execWith('');
		const { apply } = await mountHandlers(
			probeDepsAvailable('kubectl'),
			exec,
		);
		const body = parseBody(
			await apply({
				manifest: 'apiVersion: v1\nkind: Pod\n',
				namespace: 'prod',
				dryRun: true,
			}),
		);
		expect(body.ok).toBe('dry-run');
		expect(body.command).toBe('kubectl apply -n prod -f -');
	});

	it('k8s_apply runs kubectl with confirm: true', async () => {
		const exec = execWith('pod/web-0 created\n');
		const { apply } = await mountHandlers(
			probeDepsAvailable('kubectl'),
			exec,
		);
		const body = parseBody(
			await apply({
				manifest: 'apiVersion: v1\nkind: Pod\n',
				confirm: true,
			}),
		);
		expect(body.ok).toBe(true);
		const calls = (
			exec as unknown as {
				calls: { argv: readonly string[]; stdin?: string }[];
			}
		).calls;
		expect(calls[0]?.argv).toEqual(['kubectl', 'apply', '-f', '-']);
		// x00169: the manifest used to be parsed and then never sent
		// anywhere — `kubectl apply -f -` ran against an empty stdin.
		expect(calls[0]?.stdin).toBe('apiVersion: v1\nkind: Pod\n');
	});

	it('exposes two tool registrations under the namespace prefix', () => {
		const regs = buildContainerBuildToolRegistrations({
			namespacePrefix: 'container',
			probeDeps: probeDepsAvailable('docker'),
			runExec: execWith(''),
		});
		expect(regs.map((r) => r.id)).toEqual(['container_build', 'k8s_apply']);
	});
});

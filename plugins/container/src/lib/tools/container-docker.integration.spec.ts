/**
 * The docker tools against the real daemon, in a sandbox of their own:
 * every network and volume is created under a unique name and removed
 * however the spec ends, and a container runs only from an image already
 * present, so the spec never pulls, never touches another resource on
 * the machine, and is skipped where no daemon answers.
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterAll, describe, expect, it } from 'vitest';

import { createFakeToolServer } from '@delendai/test-kit';

import { buildContainerDockerToolRegistrations } from './container-docker.tool';

const docker = (...args: string[]): boolean => {
	try {
		execFileSync('docker', args, { stdio: 'ignore', timeout: 20_000 });
		return true;
	} catch {
		return false;
	}
};

const daemon = docker('info', '--format', '{{.ServerVersion}}');
const alpine = daemon && docker('image', 'inspect', 'alpine:3');
const sandbox = `delendai-spec-${String(process.pid)}-${String(Date.now())}`;

type IHandler = (
	args: unknown,
) => Promise<{ content: Array<{ text: string }> }>;

const mount = async () => {
	const root = mkdtempSync(join(tmpdir(), 'docker-sandbox-'));
	const tools: Record<string, IHandler> = {};
	const server = createFakeToolServer({
		onRegisterTool: ({ name, handler }) => {
			tools[name] = handler as IHandler;
		},
	});
	for (const registration of buildContainerDockerToolRegistrations({
		namespacePrefix: 'c',
		workspaceRootAbs: root,
	}))
		await registration.register(server);
	const call = async (name: string, args: unknown) =>
		JSON.parse(
			(await (tools[`c_${name}`] as IHandler)(args)).content[0]?.text ??
				'{}',
		) as Record<string, unknown>;
	return { call, root };
};

describe.skipIf(!daemon)('container docker tools against the daemon', () => {
	afterAll(() => {
		docker('network', 'rm', sandbox);
		docker('volume', 'rm', '-f', sandbox);
	});

	it('creates, lists and removes its own network and volume', async () => {
		const { call, root } = await mount();
		try {
			for (const kind of ['network', 'volume'] as const) {
				expect(
					await call(`container_${kind}`, {
						action: 'create',
						name: sandbox,
						confirm: true,
					}),
				).toMatchObject({ ok: true });
				const listed = await call(`container_${kind}`, {
					action: 'ls',
				});
				expect(String(listed.stdout)).toContain(sandbox);
				expect(
					await call(`container_${kind}`, {
						action: 'rm',
						name: sandbox,
						confirm: true,
					}),
				).toMatchObject({ ok: true });
				expect(
					String(
						(await call(`container_${kind}`, { action: 'ls' }))
							.stdout,
					),
				).not.toContain(sandbox);
			}
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	}, 120_000);

	it.skipIf(!alpine)(
		'runs a throwaway container that leaves nothing behind',
		async () => {
			const { call, root } = await mount();
			try {
				const ran = await call('container_run', {
					image: 'alpine:3',
					command: ['echo', sandbox],
					confirm: true,
				});
				expect(ran).toMatchObject({ ok: true });
				expect(String(ran.stdout)).toContain(sandbox);
				expect(docker('container', 'inspect', sandbox)).toBe(false);
			} finally {
				rmSync(root, { recursive: true, force: true });
			}
		},
		120_000,
	);
});

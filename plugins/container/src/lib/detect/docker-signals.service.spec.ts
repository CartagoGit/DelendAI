import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import type { IArgvExec, IProbeDeps } from '@delendai/core/contracts';
import { createFakeToolServer } from '@delendai/test-kit';

import { buildContainerDockerToolRegistrations } from '../tools/container-docker.tool';
import { dockerSignals } from './docker-signals.service';

type IHandler = (
	args: unknown,
) => Promise<{ content: Array<{ text: string }> }>;

const probe: IProbeDeps = {
	commandExists: async () => true,
	runVersion: async () => 'Docker version 29.0.0',
};
const runExec: IArgvExec = async () => ({
	code: 0,
	stdout: '',
	stderr: '',
	timedOut: false,
});

const run = async (root: string) => {
	const tools: Record<string, IHandler> = {};
	const server = createFakeToolServer({
		onRegisterTool: ({ name, handler }) => {
			tools[name] = handler as IHandler;
		},
	});
	for (const registration of buildContainerDockerToolRegistrations({
		namespacePrefix: 'c',
		workspaceRootAbs: root,
		deps: {
			probeDeps: probe,
			runExec,
			usesDocker: async () => (await dockerSignals(root)).length > 0,
		},
	}))
		await registration.register(server);
	return async (name: string, args: unknown) =>
		JSON.parse(
			(await (tools[`c_${name}`] as IHandler)(args)).content[0]?.text ??
				'{}',
		) as Record<string, unknown>;
};

describe('docker signals', () => {
	it('names the root entries that say the project uses Docker; without them the tools only read', async () => {
		const root = mkdtempSync(join(tmpdir(), 'docker-signals-'));
		try {
			expect(await dockerSignals(root)).toEqual([]);
			const passive = await run(root);
			expect(
				String(
					(
						await passive('container_run', {
							image: 'alpine',
							confirm: true,
						})
					).reason,
				),
			).toContain('no sign of using Docker');
			expect(
				await passive('container_network', { action: 'ls' }),
			).toMatchObject({ ok: true });
			writeFileSync(join(root, 'Dockerfile'), 'FROM alpine\n');
			mkdirSync(join(root, '.devcontainer'));
			expect(await dockerSignals(root)).toEqual([
				'Dockerfile',
				'.devcontainer',
			]);
			expect(
				await (await run(root))('container_run', {
					image: 'alpine',
					confirm: true,
				}),
			).toMatchObject({ ok: true });
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});
});

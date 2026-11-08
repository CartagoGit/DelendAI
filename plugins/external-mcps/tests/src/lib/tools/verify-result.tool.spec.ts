import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import type { IMcpPluginContext } from '@delendai/core/contracts';
import { createFakeToolServer, fakePartial } from '@delendai/test-kit';

import plugin from '../../../../src/index';

type IHandler = (
	args: unknown,
) => Promise<{ structuredContent?: Record<string, unknown> }>;

describe('verify_result, as the plugin registers it', () => {
	const roots: string[] = [];
	afterEach(() => {
		for (const root of roots.splice(0))
			rmSync(root, { recursive: true, force: true });
	});

	it('checks the produced files against the contract of the plugins this server runs', async () => {
		const root = mkdtempSync(join(tmpdir(), 'verify-result-'));
		roots.push(root);
		const peers = ['conventions'];
		const runtime = await plugin.register(
			fakePartial<IMcpPluginContext>({
				options: {},
				args: {},
				namespacePrefix: 'ext',
				pluginCacheDir: 'external-mcps',
				cacheDir: '.cache/delendai',
				docsDir: 'docs/delendai',
				workspace: fakePartial<IMcpPluginContext['workspace']>({
					root,
					resolve: (path: string) => join(root, path),
				}),
				peerPlugins: {
					list: () => peers,
					has: (name: string) => peers.includes(name),
				},
				pluginOptions: new Map([['conventions', {}]]),
				effects: { git: async () => ({ ok: true, output: '' }) },
			}),
		);
		const registrations =
			'registrations' in runtime ? runtime.registrations : runtime;
		const tools: Record<string, IHandler> = {};
		const server = createFakeToolServer({
			onRegisterTool: ({ name, handler }) => {
				tools[name] = handler as IHandler;
			},
		});
		for (const tool of registrations.tools ?? [])
			await tool.register(server);
		const verify = tools.ext_verify_result;
		if (verify === undefined)
			throw new Error('verify_result was not registered');
		const answer = (
			await verify({ files: [{ path: 'stray.txt', content: 'x' }] })
		).structuredContent;
		expect(answer?.checked).toEqual(['conventions']);
		expect(answer?.findings).toEqual([
			expect.objectContaining({
				kind: 'placement',
				path: 'stray.txt',
				resolvedTo: 'project',
			}),
		]);
		if ('dispose' in runtime) await runtime.dispose?.();
	});
});

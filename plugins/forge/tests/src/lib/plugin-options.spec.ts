import { describe, expect, it } from 'vitest';

import type { IMcpPluginContext } from '@mcp-vertex/core/public';

import plugin from '../../../src/index';

const baseCtx = (options: unknown = {}): IMcpPluginContext =>
	({
		workspace: { root: '/ws', resolve: (p: string) => `/ws/${p}` },
		corePaths: { cacheDir: '.cache', docsDir: 'docs' },
		cacheDir: '.cache',
		docsDir: 'docs',
		keepLegacy: false,
		pluginCacheDir: '.cache/forge',
		pluginDocsDir: 'docs/forge',
		namespacePrefix: 'forge',
		options,
	}) as unknown as IMcpPluginContext;

describe('@mcp-vertex/forge optionsSchema', async () => {
	it('registers cleanly with valid options', async () => {
		const regs = await plugin.register(
			baseCtx({ defaultTimeoutMs: 15000 }),
		);
		expect(regs.tools?.length).toBe(5);
	});

	it('throws on invalid options', async () => {
		expect(() =>
			plugin.register(baseCtx({ defaultTimeoutMs: 'oops' })),
		).toThrow(/rejected its options/);
	});
});

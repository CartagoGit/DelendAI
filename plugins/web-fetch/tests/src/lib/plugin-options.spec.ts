/**
 * plugin-options.spec.ts — r00003 S9 (F8, O + L + I).
 *
 * The web-fetch plugin declares an explicit `optionsSchema` and validates
 * `ctx.options` through it in `register()`.
 */
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
		pluginCacheDir: '.cache/web-fetch',
		pluginDocsDir: 'docs/web-fetch',
		namespacePrefix: 'web-fetch',
		options,
	}) as unknown as IMcpPluginContext;

describe('@mcp-vertex/web-fetch optionsSchema (S9 F8)', () => {
	it('exposes an optionsSchema', () => {
		expect(plugin.optionsSchema).toBeDefined();
		expect(
			plugin.optionsSchema?.safeParse({ allowList: ['example.com'] })
				.success,
		).toBe(true);
	});

	it('registers cleanly with a valid allow-list', async () => {
		const regs = await plugin.register(
			baseCtx({ allowList: ['example.com'] }),
		);
		expect(regs.tools?.length).toBeGreaterThan(0);
	});

	it('throws before wiring tools when allowList has the wrong type', () => {
		expect(() =>
			plugin.register(baseCtx({ allowList: 'example.com' })),
		).toThrow(/rejected its options/);
	});
});

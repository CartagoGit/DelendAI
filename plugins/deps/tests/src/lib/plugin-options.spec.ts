/**
 * plugin-options.spec.ts — r00003 S9 (F6, O + L + I).
 *
 * The deps plugin declares an explicit `optionsSchema` and validates
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
		pluginCacheDir: '.cache/deps',
		pluginDocsDir: 'docs/deps',
		namespacePrefix: 'deps',
		options,
	}) as unknown as IMcpPluginContext;

describe('@mcp-vertex/deps optionsSchema (S9 F6)', async () => {
	it('exposes an optionsSchema', async () => {
		expect(plugin.optionsSchema).toBeDefined();
		expect(
			plugin.optionsSchema?.safeParse({ allowWrite: true }).success,
		).toBe(true);
	});

	it('registers cleanly with valid options (allowWrite adds write tools)', async () => {
		const readOnly = await plugin.register(baseCtx({}));
		const withWrite = await plugin.register(baseCtx({ allowWrite: true }));
		expect(withWrite.tools?.length ?? 0).toBeGreaterThan(
			readOnly.tools?.length ?? 0,
		);
	});

	it('throws before wiring tools when an option has the wrong type', async () => {
		expect(() => plugin.register(baseCtx({ allowNetwork: 'yes' }))).toThrow(
			/rejected its options/,
		);
	});
});

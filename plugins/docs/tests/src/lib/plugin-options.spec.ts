/**
 * plugin-options.spec.ts — r00003 S9 (F5, O + L + I).
 *
 * The docs plugin declares an explicit `optionsSchema` and validates
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
		pluginCacheDir: '.cache/docs',
		pluginDocsDir: 'docs/docs',
		namespacePrefix: 'docs',
		options,
	}) as unknown as IMcpPluginContext;

describe('@mcp-vertex/docs optionsSchema (S9 F5)', () => {
	it('exposes an optionsSchema', () => {
		expect(plugin.optionsSchema).toBeDefined();
		expect(
			plugin.optionsSchema?.safeParse({ roots: ['docs'] }).success,
		).toBe(true);
	});

	it('registers cleanly with valid options', async () => {
		const regs = await plugin.register(baseCtx({ roots: ['docs'] }));
		expect(regs.tools?.length).toBeGreaterThan(0);
	});

	it('throws before wiring tools when an option has the wrong type', () => {
		expect(() => plugin.register(baseCtx({ extensions: 'md' }))).toThrow(
			/rejected its options/,
		);
	});
});

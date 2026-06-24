/**
 * plugin-options.spec.ts — r00003 S9 (F4, O + L + I).
 *
 * The search plugin declares an explicit `optionsSchema` and validates
 * `ctx.options` through it in `register()`. These specs pin the contract:
 *
 *   - `optionsSchema` is exposed (the loader can validate before register);
 *   - valid options register cleanly;
 *   - an invalid option (wrong type) fails `safeParse` and `register`
 *     throws a structured error rather than silently coercing.
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
		pluginCacheDir: '.cache/search',
		pluginDocsDir: 'docs/search',
		namespacePrefix: 'search',
		options,
	}) as unknown as IMcpPluginContext;

describe('@mcp-vertex/search optionsSchema (S9 F4)', async () => {
	it('exposes an optionsSchema', async () => {
		expect(plugin.optionsSchema).toBeDefined();
		expect(
			plugin.optionsSchema?.safeParse({ maxResults: 10 }).success,
		).toBe(true);
	});

	it('registers cleanly with valid options', async () => {
		const regs = await plugin.register(
			baseCtx({ roots: ['src'], maxResults: 5 }),
		);
		expect(regs.tools?.length).toBeGreaterThan(0);
	});

	it('throws before wiring tools when an option has the wrong type', async () => {
		expect(() => plugin.register(baseCtx({ maxResults: 'lots' }))).toThrow(
			/rejected its options/,
		);
	});
});

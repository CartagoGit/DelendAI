/**
 * plugin-options.spec.ts — r00003 S9 (F7, O + L + I).
 *
 * The git plugin declares an explicit `optionsSchema` and validates
 * `ctx.options` through it in `register()`.
 */
import { describe, expect, it } from 'vitest';

import type {
	IGitRunResult,
	IGitRunner,
	IMcpPluginContext,
} from '@delendai/core/public';

import plugin from '../../src/index';

/** A fake `IGitRunner` that always succeeds, for wiring `ctx.effects.git`. */
const fakeGitRunner: IGitRunner = async (): Promise<IGitRunResult> => ({
	ok: true,
	output: '',
});

interface IBaseCtxOverrides {
	readonly effects?: IMcpPluginContext['effects'];
}

/**
 * Defaults `effects` to a working fake `ctx.effects.git` so tests that
 * are not specifically about the missing-capability case don't have to
 * think about it. The missing-capability test below passes
 * `{ effects: undefined }` explicitly, which — unlike a default
 * parameter — genuinely omits the key from the built context.
 */
const baseCtx = (
	options: unknown = {},
	overrides: IBaseCtxOverrides = {},
): IMcpPluginContext =>
	({
		workspace: { root: '/ws', resolve: (p: string) => `/ws/${p}` },
		corePaths: { cacheDir: '.cache', docsDir: 'docs' },
		cacheDir: '.cache',
		docsDir: 'docs',
		keepLegacy: false,
		pluginCacheDir: '.cache/git',
		pluginDocsDir: 'docs/git',
		namespacePrefix: 'git',
		options,
		effects:
			'effects' in overrides ? overrides.effects : { git: fakeGitRunner },
	}) as unknown as IMcpPluginContext;

describe('@delendai/git optionsSchema (S9 F7)', async () => {
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

	it('throws before wiring tools when allowWrite has the wrong type', async () => {
		expect(() => plugin.register(baseCtx({ allowWrite: 'true' }))).toThrow(
			/rejected its options/,
		);
	});

	it('refuses to register write tools when the host omits ctx.effects', () => {
		expect(() =>
			plugin.register(
				baseCtx({ allowWrite: true }, { effects: undefined }),
			),
		).toThrow(/did not supply ctx\.effects/);
	});
});

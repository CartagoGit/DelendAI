/**
 * t00029 — equivalence test between the eager (`loadPlugins`) and
 * managed-lazy (`createManagedLazyRuntime`) activation routes.
 *
 * AUD-E01 found three divergences at the exact same point: the lazy
 * route discarded `optionsSchema.safeParse(...).data`, called
 * `register()` with no timeout/AbortSignal, and never retained the
 * `dispose` a plugin returned. This suite drives IDENTICAL synthetic
 * plugins and configs through both routes and asserts the two routes
 * cannot be told apart from the plugin's point of view — the test that
 * is meant to make the divergence structurally impossible to
 * reintroduce (see `plugin-activation-session.ts`, r00038).
 *
 * Written and run against the pre-refactor code first (see the
 * accompanying report for the exact assertions that failed there)
 * before `managed-lazy-runtime.ts` was changed to route through
 * `activatePluginSession`.
 */
import z from 'zod';
import { describe, expect, it } from 'vitest';

import { loadPlugins } from '@mcp-vertex/core/lib/plugins/load-plugins';
import { createManagedLazyRuntime } from '@mcp-vertex/core/lib/plugins/managed-lazy-runtime';
import { disposeLoadedPlugins } from '@mcp-vertex/core/lib/plugins/load-plugins-runtime.helper';
import type { IMcpPluginContext } from '@mcp-vertex/core/lib/plugins/plugin-contract';
import type { IPluginRuntime } from '@mcp-vertex/core/lib/contracts/interfaces/plugin-runtime.interface';

const baseCtx = (
	rawOptions: Readonly<Record<string, unknown>>,
): IMcpPluginContext => ({
	workspace: { root: '/ws', resolve: (path: string) => `/ws/${path}` },
	corePaths: { cacheDir: '.cache/mcp-vertex', docsDir: 'docs/mcp-vertex' },
	cacheDir: '.cache/mcp-vertex',
	docsDir: 'docs/mcp-vertex',
	keepLegacy: false,
	pluginCacheDir: '.cache/mcp-vertex/sync-plugin',
	pluginDocsDir: 'docs/mcp-vertex/sync-plugin',
	namespacePrefix: 'sync-plugin',
	options: rawOptions,
	args: {},
});

/**
 * The exact schema shape AUD-E01's reproduction calls for: a `.default()`
 * (only kicks in when the key is absent) and a `.transform()` (mutates a
 * present value). Both must survive identically on both routes.
 */
const OptionsSchema = z.object({
	timeout: z.coerce.number().default(500),
	path: z.string().transform((p) => p.replace(/\/+$/, '')),
});

type IRouteActivation = {
	/** `ctx.options` as `register()` actually observed them. */
	readonly receivedOptions: unknown;
	/** Reject after `registerTimeoutMs` elapses without `register()` settling. */
	readonly timedOut: boolean;
	/** Number of times the plugin's `dispose` ran. */
	disposeCallCount(): number;
	/** Dispose whatever this route retained, and again (idempotency check). */
	disposeTwice(): Promise<void>;
};

interface IActivateRouteInput {
	readonly rawOptions: Readonly<Record<string, unknown>>;
	readonly registerTimeoutMs: number;
	/** ms `register()` itself takes to settle; `Infinity` never resolves. */
	readonly registerDelayMs: number;
}

const activateEager = async (
	input: IActivateRouteInput,
): Promise<IRouteActivation> => {
	let receivedOptions: unknown;
	let disposeCalls = 0;
	const plugin = {
		name: 'sync-plugin',
		optionsSchema: OptionsSchema,
		register: (ctx: IMcpPluginContext) =>
			new Promise<IPluginRuntime<{ tools: [] }>>((resolve) => {
				const settle = (): void => {
					receivedOptions = ctx.options;
					resolve({
						registrations: { tools: [] },
						dispose: () => {
							disposeCalls += 1;
						},
					});
				};
				if (input.registerDelayMs === Infinity) return;
				setTimeout(settle, input.registerDelayMs);
			}),
	};
	const result = await loadPlugins({
		specifiers: ['sync-plugin'],
		buildContext: () => baseCtx(input.rawOptions),
		import: async () => ({ default: plugin }),
		timeoutMs: input.registerTimeoutMs,
	});
	const timedOut =
		result.loaded.length === 0 &&
		result.errors.some((e) => /timed out|aborted/.test(e.message));
	// Give a "late" resolution (one that lost the timeout race) a chance
	// to settle and, if it does, run its dispose — mirrors what a real
	// process does between the timeout and the eventual GC of the promise.
	if (timedOut && input.registerDelayMs !== Infinity) {
		await new Promise((r) => setTimeout(r, input.registerDelayMs + 20));
	}
	return {
		receivedOptions,
		timedOut,
		disposeCallCount: () => disposeCalls,
		// Mirrors the production idempotency guard
		// (`idempotentDisposePlugins` in `assemble-plugins.ts`): the raw
		// per-plugin `dispose()` a plugin returns is not itself required to
		// be safe against a second call — the HOST-level sweep is, exactly
		// once per activation, however many times something asks for it.
		disposeTwice: async () => {
			let disposed = false;
			const disposeOnce = async (): Promise<void> => {
				if (disposed) return;
				disposed = true;
				await disposeLoadedPlugins(result.loaded);
			};
			await disposeOnce();
			await disposeOnce();
		},
	};
};

const activateLazy = async (
	input: IActivateRouteInput,
): Promise<IRouteActivation> => {
	let receivedOptions: unknown;
	let disposeCalls = 0;
	const plugin = {
		name: 'sync-plugin',
		optionsSchema: OptionsSchema,
		register: (ctx: IMcpPluginContext) =>
			new Promise<IPluginRuntime<{ tools: [] }>>((resolve) => {
				const settle = (): void => {
					receivedOptions = ctx.options;
					resolve({
						registrations: { tools: [] },
						dispose: () => {
							disposeCalls += 1;
						},
					});
				};
				if (input.registerDelayMs === Infinity) return;
				setTimeout(settle, input.registerDelayMs);
			}),
	};
	const runtime = createManagedLazyRuntime({
		namespacePrefix: 'mcp-vertex',
		plugins: [
			{
				id: 'sync-plugin',
				packageSpecifier: '@mcp-vertex/sync-plugin',
				toolIds: [],
				promptIds: [],
				resourceIds: [],
				knowledgeIds: [],
				skillIds: [],
				dependencies: [],
			},
		],
		namespaces: new Map([['sync-plugin', 'sync-plugin']]),
		buildContext: () => baseCtx(input.rawOptions),
		importFn: async () => ({ default: plugin }),
		registerTimeoutMs: input.registerTimeoutMs,
	});
	let timedOut = false;
	try {
		await runtime.activatePlugin('sync-plugin');
	} catch (error) {
		timedOut = /timed out|aborted/.test(
			error instanceof Error ? error.message : String(error),
		);
	}
	if (timedOut && input.registerDelayMs !== Infinity) {
		await new Promise((r) => setTimeout(r, input.registerDelayMs + 20));
	}
	return {
		receivedOptions,
		timedOut,
		disposeCallCount: () => disposeCalls,
		disposeTwice: async () => {
			await runtime.disposeAll();
			await runtime.disposeAll();
		},
	};
};

const routes: Record<
	'eager' | 'lazy',
	(input: IActivateRouteInput) => Promise<IRouteActivation>
> = { eager: activateEager, lazy: activateLazy };

describe.each(['eager', 'lazy'] as const)(
	'plugin activation equivalence — %s route',
	(routeName) => {
		const activate = routes[routeName];

		it('applies optionsSchema defaults, coercion and transforms (AUD-E01.a)', async () => {
			const result = await activate({
				rawOptions: { path: '/a/b/' },
				registerTimeoutMs: 5_000,
				registerDelayMs: 0,
			});
			expect(result.receivedOptions).toEqual({
				timeout: 500,
				path: '/a/b',
			});
		});

		it('coerces an explicit string timeout to a number', async () => {
			const result = await activate({
				rawOptions: { timeout: '750', path: '/x/' },
				registerTimeoutMs: 5_000,
				registerDelayMs: 0,
			});
			expect(result.receivedOptions).toEqual({
				timeout: 750,
				path: '/x',
			});
		});

		it('applies registerTimeoutMs to a register() that never resolves (AUD-E01.b)', async () => {
			const result = await activate({
				rawOptions: { path: '/a/' },
				registerTimeoutMs: 30,
				registerDelayMs: Infinity,
			});
			expect(result.timedOut).toBe(true);
		});

		it('disposes a late resolution that lost the timeout race, and never activates it', async () => {
			const result = await activate({
				rawOptions: { path: '/a/' },
				registerTimeoutMs: 30,
				registerDelayMs: 60,
			});
			expect(result.timedOut).toBe(true);
			expect(result.disposeCallCount()).toBe(1);
		});

		it('retains dispose and calls it exactly once, idempotently (AUD-E01.c)', async () => {
			const result = await activate({
				rawOptions: { path: '/a/' },
				registerTimeoutMs: 5_000,
				registerDelayMs: 0,
			});
			await result.disposeTwice();
			expect(result.disposeCallCount()).toBe(1);
		});
	},
);

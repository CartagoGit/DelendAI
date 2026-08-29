import type { IMcpPluginContext } from '../../plugins/plugin-contract';

/**
 * Result of validating a plugin's configured options against its
 * declared `optionsSchema`. `ok: true` always carries the PARSED
 * context (`parsed.data`, not the raw input) so that a plugin's
 * `.default()` / `.coerce()` / `.transform()` / `.preprocess()`
 * schema rules take effect identically no matter which activation
 * route (eager or managed-lazy) produced the context — see
 * `normalizePluginOptions` in `plugin-activation-session.ts` and
 * AUD-E01.a.
 */
export type IPluginOptionsNormalizationResult =
	| { readonly ok: true; readonly ctx: IMcpPluginContext }
	| { readonly ok: false; readonly message: string };

/**
 * One plugin's `dispose()` failure surfaced from
 * `IManagedLazyRuntime.disposeAll()` (`managed-lazy-runtime.ts`). Kept
 * separate from the loader's own `IPluginRegisterErrorInfo` — this is a
 * teardown-time failure, not a registration-time one — and used by
 * `assemble-plugins.ts` to aggregate lazy-route dispose errors the same
 * way `disposeLoadedPlugins` aggregates them for the eager route
 * (AUD-E02 / r00039).
 */
export interface IManagedLazyDisposeAggregateError {
	readonly pluginId: string;
	readonly error: unknown;
}

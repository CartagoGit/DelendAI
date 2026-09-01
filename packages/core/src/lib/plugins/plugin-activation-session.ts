/**
 * PluginActivationSession (r00038 / AUD-E01) — the one primitive both
 * the eager loader (`load-plugins.ts`) and the managed-lazy runtime
 * (`managed-lazy-runtime.ts`) go through to turn a resolved plugin +
 * context into a running `IPluginRuntime`.
 *
 * Before this module existed the two routes each re-implemented
 * "parse options, apply a register timeout, retain the returned
 * `dispose`" independently, and had already diverged in all three
 * respects: lazy discarded `parsed.data`, called `register()` with no
 * timeout/AbortSignal, and never kept the `dispose` it received. The
 * fix here is deliberately NOT a third implementation — it is making
 * both routes call the SAME code:
 *
 *  - `normalizePluginOptions` is the only place `optionsSchema` is
 *    parsed. It is used by `load-plugins.ts`'s resolve phase (eager)
 *    and by `activatePluginSession` (lazy) — never duplicated.
 *  - `registerPluginWithLifecycle` (`load-plugins-runtime.helper.ts`)
 *    already implemented the timeout/AbortSignal/dispose-retention
 *    contract correctly for the eager path (it normalizes the
 *    returned runtime via `normalizePluginRuntimeInternal`, which
 *    always keeps `dispose`, and disposes a late-resolving `register()`
 *    that loses the timeout race). `activatePluginSession` composes
 *    it rather than re-implementing it, so the managed-lazy route
 *    inherits the exact same guarantees for free.
 */
import type { IPluginOptionsNormalizationResult } from '../contracts/interfaces/plugin-activation-session.interface';
import type { IPluginRuntime } from '../contracts/interfaces/plugin-runtime.interface';
import type {
	IMcpPlugin,
	IMcpPluginContext,
	IMcpPluginRegistrations,
} from './plugin-contract';
import { registerPluginWithLifecycle } from './load-plugins-runtime.helper';

/**
 * Parse `ctx.options` against the plugin's declared `optionsSchema`,
 * always resolving to `parsed.data` on success. A plugin without an
 * `optionsSchema` passes its context through unchanged. Returning a
 * discriminated result (rather than throwing) lets `load-plugins.ts`
 * keep its existing per-specifier error collection during the resolve
 * phase, while `activatePluginSession` below turns the same result
 * into a structured throw for the lazy route.
 */
export const normalizePluginOptions = (
	plugin: IMcpPlugin,
	ctx: IMcpPluginContext,
): IPluginOptionsNormalizationResult => {
	if (!plugin.optionsSchema) return { ok: true, ctx };
	const parsed = plugin.optionsSchema.safeParse(ctx.options);
	if (!parsed.success) {
		return {
			ok: false,
			message: `plugin "${plugin.name}" rejected its options (mcp-vertex.config.json → plugins.${plugin.name}.options).`,
		};
	}
	const parsedOptions =
		'data' in parsed
			? (parsed.data as Readonly<Record<string, unknown>>)
			: ctx.options;
	return { ok: true, ctx: { ...ctx, options: parsedOptions } };
};

/**
 * Activate one plugin end to end: normalize its options, then
 * register it under the shared timeout/AbortSignal/dispose-retention
 * contract. A `register()` that never resolves is abandoned at
 * `timeoutMs` (or when `signal` aborts) — the caller sees a rejected
 * promise and the eventual late resolution, if any, is disposed
 * without ever being handed back to a caller (see
 * `registerPluginWithLifecycle`).
 */
export const activatePluginSession = async (input: {
	readonly plugin: IMcpPlugin;
	readonly ctx: IMcpPluginContext;
	readonly timeoutMs: number;
	readonly signal?: AbortSignal | undefined;
}): Promise<IPluginRuntime<IMcpPluginRegistrations>> => {
	const normalized = normalizePluginOptions(input.plugin, input.ctx);
	if (!normalized.ok) throw new Error(normalized.message);
	return registerPluginWithLifecycle({
		plugin: input.plugin,
		ctx: normalized.ctx,
		timeoutMs: input.timeoutMs,
		signal: input.signal,
	});
};

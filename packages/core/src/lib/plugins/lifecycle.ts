/**
 * lifecycle.ts — f00184 (Track D).
 *
 * Splits plugin activation into two explicit phases so the
 * router can validate manifests, resolve capabilities, and run
 * side effects in the correct order.
 *
 *   prepare()   — side-effect-free. Returns a `PreparedPlugin`
 *                 payload (parsed config, validated manifest,
 *                 normalised name). Runnable in CI / manifest
 *                 validators without booting the plugin.
 *
 *   activate()  — capabilities are granted. Returns an
 *                 `ActivePlugin` payload (tool registrations,
 *                 open resources, started timers). Idempotency
 *                 is the responsibility of the plugin.
 *
 *   dispose()   — cleanup. Idempotent — a second call is a no-op.
 *
 * The router keeps accepting the legacy `register(ctx)` shape via
 * `adaptLegacyPlugin` (see `plugin-contract.ts`).
 */

import {
	createCapabilityContext,
	parseDeclaredCapabilities,
	summariseLegacyShimWarning,
} from '../capabilities/inject';
import type { ICapabilityImplementationMap } from '../capabilities/inject';
import type {
	CapabilitiesToCtx,
	Capability,
	ICapabilityRefusal,
} from '../capabilities/schema';
import type { IPluginRuntime } from '../contracts/interfaces/plugin-runtime.interface';
import type {
	IMcpPlugin,
	IMcpPluginContext,
	IMcpPluginRegistrations,
} from './plugin-contract';

/**
 * Read-only context passed to `prepare()`. Capabilities are NOT
 * granted here — `prepare()` must be side-effect-free.
 */
export interface IPrepareContext {
	readonly name: string;
	readonly manifest: unknown;
	readonly configResolved: Record<string, unknown>;
	readonly logger: Pick<Console, 'log' | 'warn' | 'error'>;
}

/**
 * Read-only context passed to `activate()`. Includes everything
 * `prepare()` had PLUS capabilities granted by the router.
 *
 * `C` is the plugin's DECLARED capability set: `capabilities` is
 * narrowed to exactly that set (see `CapabilitiesToCtx`), so
 * accessing an undeclared capability is a compile-time error. The
 * default (`never`) is the empty context — least privilege when a
 * plugin author does not opt in to any capability.
 */
export interface IActivateContext<C extends Capability = never>
	extends IPrepareContext {
	readonly capabilities: CapabilitiesToCtx<C>;
}

/**
 * `prepare()` payload. Plugin-specific; the lifecycle wrapper
 * passes it through unchanged to `activate()`.
 */
export type PreparedPlugin<P> = P;

/**
 * `activate()` payload. Plugin-specific; the lifecycle wrapper
 * passes it through unchanged to `dispose()`.
 */
export type ActivePlugin<A> = A;

export type IPluginLifecycleActivation =
	| IMcpPluginRegistrations
	| IPluginRuntime<IMcpPluginRegistrations>;

interface ILegacyPreparedPlugin {
	readonly name: string;
	readonly plugin: IMcpPlugin;
	readonly pluginContext: IMcpPluginContext;
	readonly signal: AbortSignal | undefined;
}

/**
 * Phased lifecycle contract. A plugin MAY implement this
 * interface instead of (or in addition to) the legacy
 * `register(ctx)` shape — `definePlugin` handles both.
 *
 * `C` is the capability set the plugin declares in its manifest; it
 * narrows `ctx.capabilities` inside `activate()`.
 */
export interface IPhasedLifecycle<
	P = unknown,
	A = unknown,
	C extends Capability = never,
> {
	prepare(ctx: IPrepareContext): Promise<P>;
	activate(prepared: P, ctx: IActivateContext<C>): Promise<A>;
	dispose(active: A): Promise<void>;
}

/**
 * Detect whether a plugin implements the phased lifecycle.
 * Returns `true` when `prepare` + `activate` + `dispose` are all
 * present and callable.
 */
export const hasPhasedLifecycle = (
	plugin: unknown,
): plugin is IPhasedLifecycle =>
	typeof plugin === 'object' &&
	plugin !== null &&
	typeof (plugin as { prepare?: unknown }).prepare === 'function' &&
	typeof (plugin as { activate?: unknown }).activate === 'function' &&
	typeof (plugin as { dispose?: unknown }).dispose === 'function';

const isPluginRuntime = (
	active: IPluginLifecycleActivation,
): active is IPluginRuntime<IMcpPluginRegistrations> =>
	typeof active === 'object' && active !== null && 'registrations' in active;

/**
 * Tracks the in-flight/settled disposal for a given `active` payload so
 * concurrent or repeated `safeDispose` calls converge on one cleanup run.
 * A `WeakMap` keyed on the payload itself (rather than a counter or a flag
 * stored elsewhere) means the guard needs no explicit reset: once the
 * `active` payload is no longer referenced by any caller, its entry is
 * eligible for garbage collection along with it.
 */
const disposalSettlements = new WeakMap<object, Promise<void>>();

/**
 * Run `dispose()` exactly once per `active` payload: catches errors and
 * memoises the settlement so the router (or any other caller) can call it
 * twice — or from two concurrent code paths — without running cleanup
 * twice. Every caller for the same `active` payload awaits the very same
 * settlement, including callers that arrive while the first `dispose()`
 * is still in flight.
 *
 * Requiring `A extends object` is what makes the guard sound: identity
 * (via `WeakMap`) is the only reliable way to recognise "the same active
 * payload" across independent call sites, and every real `ActivePlugin`
 * payload is an object already.
 */
export const safeDispose = async <A extends object>(
	dispose: ((active: A) => Promise<void>) | undefined,
	active: A | undefined,
): Promise<void> => {
	if (dispose === undefined || active === undefined) return;
	const existingSettlement = disposalSettlements.get(active);
	if (existingSettlement !== undefined) return existingSettlement;
	const settlement = (async () => {
		try {
			await dispose(active);
		} catch {
			// best-effort — same semantics as the commit-policy plugin
			// (x00261 / IPluginRuntime.dispose).
		}
	})();
	// Set synchronously (no `await` above this line) so concurrent callers
	// racing on the same tick observe the settlement before starting a
	// second `dispose()`.
	disposalSettlements.set(active, settlement);
	return settlement;
};

/**
 * Wrap a legacy `register(ctx, signal)` plugin in the phased contract the
 * router expects. The adapter keeps the full MCP plugin context via closure,
 * so compatibility stays exact while the router can standardise on one
 * `prepare -> activate -> dispose` execution path.
 */
export const adaptLegacyLifecycle = (
	plugin: IMcpPlugin,
	pluginContext: IMcpPluginContext,
	signal?: AbortSignal,
): IPhasedLifecycle<ILegacyPreparedPlugin, IPluginLifecycleActivation> => ({
	async prepare(ctx) {
		return {
			name: ctx.name,
			plugin,
			pluginContext,
			signal,
		};
	},
	async activate(prepared) {
		return prepared.plugin.register(
			prepared.pluginContext,
			prepared.signal,
		);
	},
	async dispose(active) {
		if (!isPluginRuntime(active) || active.dispose === undefined) return;
		await safeDispose(
			async () => Promise.resolve(active.dispose?.()),
			active,
		);
	},
});

/**
 * Compose `prepare` + `activate` so callers don't have to repeat
 * the pattern. Returns the active payload so the caller can
 * pass it to `dispose` later.
 *
 * f00188 — the phased boot path. Before running, this resolves the
 * plugin's DECLARED capabilities off `prepareCtx.manifest`; when a
 * plugin ships without an explicit `capabilities` array it boots
 * under the legacy shim (every capability granted) and the warning
 * is emitted once via `prepareCtx.logger.warn` so the operator sees
 * it (the `c00137` lint escalates this to an error after migration).
 */
export const runLifecycle = async <P, A, C extends Capability = never>(
	lifecycle: IPhasedLifecycle<P, A, C>,
	prepareCtx: IPrepareContext,
	activateCtx: IActivateContext<C>,
): Promise<A> => {
	const declared = parseDeclaredCapabilities(prepareCtx.manifest);
	if (declared.length === 0) {
		prepareCtx.logger.warn(
			summariseLegacyShimWarning(prepareCtx.name).message,
		);
	}
	const prepared = await lifecycle.prepare(prepareCtx);
	const active = await lifecycle.activate(prepared, activateCtx);
	return active;
};

/**
 * f00188 — build the `activate()` context from a prepared context,
 * the plugin's declared capabilities and the runtime's implementation
 * map. `capabilities` is the runtime enforcement Proxy: declared
 * capabilities resolve to the real implementation, undeclared ones
 * return a typed `capability-denied` refusal.
 *
 * ```ts
 * const ctx = buildActivateContext(prepareCtx, ['fs:read'] as const, impl);
 * const active = await runLifecycle(lifecycle, prepareCtx, ctx);
 * ```
 */
export const buildActivateContext = <C extends Capability>(
	prepareCtx: IPrepareContext,
	declared: readonly C[],
	impl: ICapabilityImplementationMap,
	onRefuse?: (refusal: ICapabilityRefusal) => void,
): IActivateContext<C> => ({
	...prepareCtx,
	capabilities: createCapabilityContext(declared, impl, onRefuse),
});

/**
 * Re-export `IMcpPluginContext` so consumers can import the
 * full surface from one place.
 */
export type { IMcpPluginContext };

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

import type { IMcpPluginContext } from './plugin-contract';

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
 */
export interface IActivateContext extends IPrepareContext {
	readonly capabilities: Readonly<Record<string, unknown>>;
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

/**
 * Phased lifecycle contract. A plugin MAY implement this
 * interface instead of (or in addition to) the legacy
 * `register(ctx)` shape — `definePlugin` handles both.
 */
export interface IPhasedLifecycle<P = unknown, A = unknown> {
	prepare(ctx: IPrepareContext): Promise<P>;
	activate(prepared: P, ctx: IActivateContext): Promise<A>;
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

/**
 * Run `dispose()` idempotently: catches errors and returns a
 * stable result so the router can call it twice without breaking
 * host shutdown.
 */
export const safeDispose = async <A>(
	dispose: ((active: A) => Promise<void>) | undefined,
	active: A | undefined,
): Promise<void> => {
	if (dispose === undefined || active === undefined) return;
	try {
		await dispose(active);
	} catch {
		// best-effort — same semantics as the commit-policy plugin
		// (x00261 / IPluginRuntime.dispose).
	}
};

/**
 * Compose `prepare` + `activate` so callers don't have to repeat
 * the pattern. Returns the active payload so the caller can
 * pass it to `dispose` later.
 */
export const runLifecycle = async <P, A>(
	lifecycle: IPhasedLifecycle<P, A>,
	prepareCtx: IPrepareContext,
	activateCtx: IActivateContext,
): Promise<A> => {
	const prepared = await lifecycle.prepare(prepareCtx);
	const active = await lifecycle.activate(prepared, activateCtx);
	return active;
};

/**
 * Re-export `IMcpPluginContext` so consumers can import the
 * full surface from one place.
 */
export type { IMcpPluginContext };

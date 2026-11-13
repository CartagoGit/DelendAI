/**
 * dry-run/dry-run-scope.helper.ts — the ambient dry-run scope.
 *
 * `guardEffectCapability` (effect-guard.helper.ts) needs the caller's
 * `dryRun` flag AT THE MOMENT the capability was constructed. That works
 * cleanly when a capability is built fresh per call. It does not, by
 * itself, cover this codebase's actual shape: a plugin's `register(ctx)`
 * runs ONCE at boot, and every tool handler it returns closes over the
 * SAME `ctx` (and therefore the same capability instances) for the
 * lifetime of the process — there is no per-call context to rebuild a
 * capability from.
 *
 * This module bridges that gap with an `AsyncLocalStorage` scope: the
 * router (`tool-surface-runtime.service.ts`) opens one scope per tool
 * invocation, seeded with THAT call's `args.dryRun`, wrapping the
 * handler call itself. A capability built once at register time (e.g.
 * `IPluginEffectsCapability.git`) reads the ambient flag on every
 * invocation and re-applies the guard fresh each time — so the same
 * long-lived capability instance is correctly gated call-by-call,
 * without the plugin handler ever having to read or forward
 * `args.dryRun` itself. `AsyncLocalStorage` propagates through awaited
 * continuations, so this holds even when the handler's mutation happens
 * several `await`s deep inside its own call graph.
 */
import { AsyncLocalStorage } from 'node:async_hooks';

interface IDryRunScopeState {
	readonly dryRun: boolean;
}

const dryRunScopeStorage = new AsyncLocalStorage<IDryRunScopeState>();

/**
 * Run `fn` with the ambient dry-run flag set to `dryRun` for the
 * duration of its call stack (including every awaited continuation
 * inside it). The router calls this exactly once per tool invocation.
 */
export const runWithDryRunScope = async <T>(
	dryRun: boolean,
	fn: () => Promise<T>,
): Promise<T> => dryRunScopeStorage.run({ dryRun }, fn);

/**
 * The ambient dry-run flag for the currently executing tool call.
 * Defaults to `false` (real effects allowed) when read from OUTSIDE any
 * `runWithDryRunScope` call — e.g. boot-time plugin setup, or a
 * background sweep unrelated to a tool invocation. That default is a
 * deliberate scope limitation, not a gap in THIS pilot: no dry-run
 * request exists to honour outside a routed tool call, so there is
 * nothing to refuse.
 */
export const getActiveDryRunFlag = (): boolean =>
	dryRunScopeStorage.getStore()?.dryRun ?? false;

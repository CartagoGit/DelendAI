/**
 * capabilities/effect-broker.ts — r00037 S2: the composition primitive
 * for ambient-dry-run-gated capabilities.
 *
 * `dry-run/effect-guard.helper.ts`'s `guardEffectCapability` proved that
 * a single mutating function can be made to refuse its real effect
 * while `dryRun` is true. `dry-run/dry-run-scope.helper.ts` proved that
 * the flag it reads can be ambient (an `AsyncLocalStorage` scope the
 * router opens once per tool call), so ONE capability instance built at
 * plugin-register time is still gated call-by-call for the lifetime of
 * the process. `dry-run/effect-capability-factory.helper.ts` wired
 * those two together by hand for exactly one capability (git).
 *
 * `createEffectBroker` is that wiring generalised: given a map of named
 * `{ kind, perform, describe? }` definitions, it returns the matching
 * map of guarded capabilities in one call, with no unwrapped `perform`
 * ever escaping this module. A caller (today: `cli/assemble.ts`
 * building `IPluginEffectsCapability`) never touches
 * `guardEffectCapability` or the ambient scope directly — the broker is
 * the only point of construction, exactly as the architecture in
 * `r00037` specifies.
 *
 * Deliberately NOT included here (see `effect-capabilities.interface.ts`
 * for the same reasoning applied to `IPluginEffectsCapability`): a
 * `declaredEffects` / `trust` / `policy` filtering layer that decides
 * WHICH definitions a given plugin is allowed to receive. That decision
 * belongs to the caller assembling a plugin's context (it already knows
 * the plugin's manifest and trust level) — the broker's own
 * responsibility is narrower and does not need to duplicate it: given
 * the definitions you hand it, guard every one of them, and hand back
 * nothing else.
 */
import { guardEffectCapability } from '../dry-run/effect-guard.helper';
import { getActiveDryRunFlag } from '../dry-run/dry-run-scope.helper';
import type {
	IEffectBrokerCapabilityDefinition,
	IEffectBrokerCapabilities,
	IEffectBrokerDefinitions,
} from '../contracts/interfaces/effect-broker.interface';

/**
 * Wrap ONE capability definition so every call re-reads the ambient
 * dry-run flag (rather than capturing it once at construction) and is
 * refused via `guardEffectCapability` whenever that flag is `true`.
 * Exported alongside `createEffectBroker` (rather than kept private)
 * because a caller with exactly one capability to guard — the shape
 * `effect-capability-factory.helper.ts` used to hand-roll — should not
 * have to build a one-entry object just to reach it.
 */
export const guardWithAmbientDryRun = <Args extends readonly unknown[], R>(
	definition: IEffectBrokerCapabilityDefinition<Args, R>,
): ((...args: Args) => R) => {
	const { kind, perform, describe } = definition;
	return (...args: Args): R =>
		// `guardEffectCapability`'s declared signature returns
		// `R | Promise<R>` to stay generic over both sync and async
		// `perform`s. At runtime the result here is exactly `R`: the call
		// either throws `DryRunEffectRefusedError` (no value produced) or
		// returns `perform(...args)` completely unchanged — never
		// re-wrapped in an extra `Promise`. The cast below narrows the
		// static type back to `perform`'s own return type; it changes
		// nothing about what actually runs.
		guardEffectCapability({
			capability: kind,
			dryRun: getActiveDryRunFlag(),
			perform,
			...(describe !== undefined ? { describe } : {}),
		})(...args) as R;
};

/**
 * Build a whole capability object in one call: every value of
 * `definitions` becomes a guarded function under the same key,
 * refusing its real effect while the ambient dry-run scope is active.
 * Order of keys and their arity/return types are preserved by the
 * mapped-type return, so a caller assembling e.g.
 * `IPluginEffectsCapability` gets a fully-typed result with no manual
 * per-field wiring.
 */
export const createEffectBroker = <TDefs extends IEffectBrokerDefinitions>(
	definitions: TDefs,
): IEffectBrokerCapabilities<TDefs> => {
	const entries = Object.entries(definitions).map(
		([key, definition]) =>
			[key, guardWithAmbientDryRun(definition)] as const,
	);
	return Object.fromEntries(entries) as IEffectBrokerCapabilities<TDefs>;
};

/**
 * effect-broker.interface.ts — vocabulary for
 * `capabilities/effect-broker.ts` (r00037 S2).
 *
 * `dry-run/effect-capability-factory.helper.ts` proved the pattern by
 * hand for exactly one capability (`createDryRunGatedGitRunner`): wrap
 * a real implementation so every call re-reads the ambient dry-run
 * flag (`dry-run/dry-run-scope.helper.ts`) and refuses via
 * `guardEffectCapability` instead of reaching the real effect. Written
 * by hand, that pattern does not scale past one capability — every new
 * mutating capability a plugin needs would repeat the same three lines
 * around a different `perform`. `EffectBroker` is the composition layer:
 * ONE call, given a map of named capability definitions, returns the
 * matching map of guarded capabilities — so the broker, not each call
 * site, is the only place a real `perform` function is ever handed out
 * unwrapped.
 */
import type { TEffectCapabilityKind } from './effect-guard.interface';

/**
 * One capability the broker will guard: `kind` selects the vocabulary
 * `guardEffectCapability` reports on refusal, `perform` is the REAL
 * unwrapped implementation (a `fs.writeFile`, an `execFile`, a
 * `fetch`, ...), and `describe` optionally renders a per-call
 * description folded into the refusal reason.
 */
export interface IEffectBrokerCapabilityDefinition<
	Args extends readonly unknown[],
	R,
> {
	readonly kind: TEffectCapabilityKind;
	readonly perform: (...args: Args) => R;
	readonly describe?: (...args: Args) => string;
}

/** A named map of capability definitions handed to `createEffectBroker`. */
export type IEffectBrokerDefinitions = Readonly<
	Record<string, IEffectBrokerCapabilityDefinition<readonly never[], unknown>>
>;

/**
 * The guarded capability map `createEffectBroker` returns: same keys as
 * the input definitions, each value now a function that refuses to
 * reach its `perform` while the ambient dry-run scope is active.
 */
export type IEffectBrokerCapabilities<TDefs extends IEffectBrokerDefinitions> =
	{
		readonly [K in keyof TDefs]: TDefs[K] extends IEffectBrokerCapabilityDefinition<
			infer Args,
			infer R
		>
			? (...args: Args) => R
			: never;
	};

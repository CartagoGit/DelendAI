/**
 * dry-run/effect-guard.ts — f00189 follow-up (Track F / security).
 *
 * `enforce.ts` only checks the handler's RETURN VALUE, and only after
 * the handler has already run. A plugin that ignores `args.dryRun`
 * still performs its filesystem write / git mutation / spawn /
 * network call — the router merely tells the caller afterwards that
 * the response was malformed. Detection is not prevention.
 *
 * This module gives a capability constructor a way to make the
 * mutation itself impossible while `dryRun` is true, instead of
 * merely detectable after the fact:
 *
 *   - `guardEffectCapability` wraps ONE mutating function (a
 *     filesystem write, a git command, a spawn, a network call) at
 *     the point where it is constructed. When built with
 *     `dryRun: true`, CALLING the wrapped function throws a typed
 *     `DryRunEffectRefusedError` instead of running the real
 *     implementation — the real `perform` is never reached. Because
 *     the refusal is baked in at construction time, a handler that
 *     never reads `args.dryRun` and calls the capability
 *     unconditionally still cannot perform the effect.
 *   - `runWithDryRunGate` gives the `plan -> execute` split the
 *     design asks for: while `dryRun` is true, the `execute` closure
 *     — where a handler would hold its mutating capabilities — is
 *     never invoked at all.
 *
 * STALE AS OF 8f05b5d2 (2026-08-27) AND r00037 — the paragraph that
 * used to sit here said `IMcpPluginContext` hands plugins no
 * capability object at all. That stopped being true when `8f05b5d2`
 * injected a dry-run-gated effects capability, and it is now wired
 * for every plugin through `createEffectBroker` in
 * `packages/core/src/lib/cli/assemble.ts`. The stale text was quoted
 * verbatim as evidence by `AUD-D02` seven hours after the commit that
 * invalidated it, which is exactly the failure mode that finding is
 * about: trusting the declaration instead of the behaviour. Keep this
 * header honest.
 *
 * Real residual gap, as of r00037: prevention is real for the `git`
 * capability, which routes through the broker. It is NOT yet real for
 * filesystem, spawn or network — `IPluginEffectsCapability` has no
 * `fs` member yet (a deliberate YAGNI, see
 * `effect-capabilities.interface.ts`), so a handler calling
 * `writeFileSync` directly is still only detected, not prevented.
 * `docs/delendai/security/dry-run-contract.md` states the guarantee
 * per capability kind; `x00288`'s effect-boundary lint is what keeps
 * new direct calls from appearing
 */
export type {
	IDryRunEffectRefusal,
	TEffectCapabilityKind,
} from '../contracts/interfaces/effect-guard.interface';
import type {
	IDryRunEffectRefusal,
	TEffectCapabilityKind,
} from '../contracts/interfaces/effect-guard.interface';

/**
 * Thrown by a capability created with `guardEffectCapability` when it
 * is invoked while its `dryRun` flag is true. Typed so a caller can
 * distinguish "the effect was correctly refused" from an unrelated
 * runtime failure inside `perform`.
 */
export class DryRunEffectRefusedError extends Error {
	readonly refusal: IDryRunEffectRefusal;

	constructor(refusal: IDryRunEffectRefusal) {
		super(refusal.reason);
		this.name = 'DryRunEffectRefusedError';
		this.refusal = refusal;
	}
}

const buildRefusalReason = (
	capability: TEffectCapabilityKind,
	describedCall: string | undefined,
): string =>
	describedCall === undefined
		? `refused ${capability} effect: dryRun is true`
		: `refused ${capability} effect: dryRun is true (${describedCall})`;

/**
 * Wrap a single mutating function so it refuses to run while
 * `dryRun` is true. The wrapping happens ONCE, at the point where the
 * capability is constructed and handed to a handler — never inside
 * the handler itself. That placement is what makes the property
 * hold: a handler that ignores `args.dryRun` and calls the capability
 * anyway still cannot reach `perform`, because the closure returned
 * here throws before `perform` is ever referenced.
 *
 * When `dryRun` is false, the original `perform` is returned
 * untouched (no wrapper overhead, no behaviour change).
 */
export const guardEffectCapability = <
	Args extends readonly unknown[],
	R,
>(input: {
	readonly capability: TEffectCapabilityKind;
	readonly dryRun: boolean;
	readonly perform: (...args: Args) => R | Promise<R>;
	/** Optional per-call description (e.g. the target path) folded
	 * into the refusal reason for easier debugging. */
	readonly describe?: (...args: Args) => string;
}): ((...args: Args) => R | Promise<R>) => {
	const { capability, dryRun, perform, describe } = input;
	if (!dryRun) return perform;
	return (...args: Args): R | Promise<R> => {
		throw new DryRunEffectRefusedError({
			kind: 'dry-run-effect-refused',
			capability,
			reason: buildRefusalReason(capability, describe?.(...args)),
		});
	};
};

/**
 * The `plan -> execute` split: while `dryRun` is true, `execute` —
 * the closure that owns the mutating capabilities — is never invoked
 * at all, so there is nothing for a careless handler to reach into.
 * Pairs with `guardEffectCapability` for defence in depth when a
 * handler cannot be structured as a clean plan/execute split (e.g. it
 * calls several independently-guarded capabilities).
 */
export const runWithDryRunGate = async <P, R>(input: {
	readonly dryRun: boolean;
	readonly plan: () => P | Promise<P>;
	readonly execute: () => R | Promise<R>;
}): Promise<P | R> => {
	if (input.dryRun) return await input.plan();
	return await input.execute();
};

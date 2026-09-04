/**
 * spend-guard.ts — the fallback-chain integration of the S7 circuit breaker.
 *
 * CRITICAL split (S7): the circuit breaker itself — the rolling session/monthly
 * spend computation and the `limitsStatus` block — lives in `usage-tracking`
 * (`circuit-breaker.ts`). The runner never re-computes spend; it READS the
 * breaker's verdict (`ISpendLimitsView`, lifted from `usage-summary.json`) and
 * shapes the routing consequence here:
 *
 *  - not breached                              → allow (spend as normal).
 *  - breached + `rerank` + a `costTier <= 1`
 *    available provider exists                 → degrade to the cheapest one.
 *  - breached + `tier-down` OR no cheap tier   → hard error, fired BEFORE any
 *                                                subprocess/HTTP call.
 *
 * Pure over its inputs (no I/O, no clock): unit-testable in isolation, and the
 * live wiring reads the in-memory limits mirror so there is no per-decision fs
 * read on the hot path.
 */
import type {
	IProviderAvailability,
	IProviderCapabilities,
} from '@delendai/core/public';

import type { FallbackStrategy } from './fallback';

/** The scope a spend cap was breached in (mirrors usage-tracking). */
export type SpendBreachScope = 'session' | 'monthly';

/**
 * The slice of `usage-summary.json#limitsStatus` the guard needs. Read from
 * the breaker's output; the runner never fills these numbers itself.
 */
export interface ISpendLimitsView {
	readonly sessionSpendUsd: number;
	readonly sessionLimitUsd: number | null;
	readonly monthlySpendUsd: number;
	readonly monthlyLimitUsd: number | null;
	readonly breached: SpendBreachScope | null;
}

/** A neutral view (no caps, nothing breached). */
export const emptySpendLimitsView = (): ISpendLimitsView => ({
	sessionSpendUsd: 0,
	sessionLimitUsd: null,
	monthlySpendUsd: 0,
	monthlyLimitUsd: null,
	breached: null,
});

export interface ISpendLimitError {
	readonly scope: SpendBreachScope;
	readonly limitUsd: number;
	readonly observedUsd: number;
	readonly message: string;
}

/** The routing consequence of the current breach state. */
export type SpendGuardPlan =
	| { readonly action: 'allow' }
	| {
			readonly action: 'degrade';
			readonly scope: SpendBreachScope;
			readonly toProvider: string;
	  }
	| { readonly action: 'hard-error'; readonly error: ISpendLimitError };

export interface ISpendGuardInput {
	readonly limits: ISpendLimitsView;
	readonly fallbackStrategy: FallbackStrategy;
	readonly providers: readonly IProviderCapabilities[];
	readonly availabilityOf: (id: string) => IProviderAvailability;
}

/** Providers at or below this tier are "cheap enough" to degrade onto. */
export const CHEAP_COST_TIER = 1;

const observedFor = (
	limits: ISpendLimitsView,
	scope: SpendBreachScope,
): number =>
	scope === 'session' ? limits.sessionSpendUsd : limits.monthlySpendUsd;

const limitFor = (limits: ISpendLimitsView, scope: SpendBreachScope): number =>
	(scope === 'session' ? limits.sessionLimitUsd : limits.monthlyLimitUsd) ??
	0;

/** The cheapest currently-available provider at `costTier <= 1`, if any. */
export const cheapestAvailableProvider = (
	input: ISpendGuardInput,
): IProviderCapabilities | undefined =>
	input.providers
		.filter(
			(p) =>
				p.costTier <= CHEAP_COST_TIER &&
				input.availabilityOf(p.id).state === 'available',
		)
		.sort((a, b) => a.costTier - b.costTier)[0];

/** Decide what the runner should do given the breaker's verdict. */
export const decideSpendGuard = (input: ISpendGuardInput): SpendGuardPlan => {
	const scope = input.limits.breached;
	if (scope === null) return { action: 'allow' };

	const observedUsd = observedFor(input.limits, scope);
	const limitUsd = limitFor(input.limits, scope);
	const hardError: SpendGuardPlan = {
		action: 'hard-error',
		error: {
			scope,
			limitUsd,
			observedUsd,
			message: `Spend limit exceeded: ${scope} spend $${observedUsd.toFixed(2)} has reached the $${limitUsd.toFixed(2)} cap. Refusing to spend before any subprocess or HTTP call.`,
		},
	};

	// Only `rerank` degrades gracefully; `tier-down` walls off hard.
	if (input.fallbackStrategy !== 'rerank') return hardError;

	const cheap = cheapestAvailableProvider(input);
	if (cheap === undefined) return hardError;
	return { action: 'degrade', scope, toProvider: cheap.id };
};

/**
 * The per-decision verdict the {@link InvocationManager} consumes as it walks
 * the fallback chain. `proceed` spends; `skip` degrades past this hop (a
 * cheaper provider is the degrade target); `block` fires the hard error
 * BEFORE any subprocess/HTTP call.
 */
export type SpendCheckOutcome =
	| { readonly outcome: 'proceed' }
	| { readonly outcome: 'skip'; readonly note: string }
	| { readonly outcome: 'block'; readonly error: ISpendLimitError };

/** Map a whole-roster {@link SpendGuardPlan} onto one chain hop's verdict. */
export const spendCheckForDecision = (
	plan: SpendGuardPlan,
	targetProviderId: string,
): SpendCheckOutcome => {
	switch (plan.action) {
		case 'allow':
			return { outcome: 'proceed' };
		case 'hard-error':
			return { outcome: 'block', error: plan.error };
		case 'degrade':
			return targetProviderId === plan.toProvider
				? { outcome: 'proceed' }
				: {
						outcome: 'skip',
						note: `spend-degraded → ${plan.toProvider}`,
					};
	}
};

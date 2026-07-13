/**
 * score.ts — the deterministic provider scorer (CRITICAL C5).
 *
 * This is the CANONICAL home of the scoring function. Both the wiki
 * (`docs/mcp-vertex/wiki/07-plugin-orchestrator-runner.md` §"advise_routing")
 * and `04-recommended-approach.md` §4.1 reference this exact file; it is
 * not duplicated in `proposals/` or `core/`.
 *
 * `scoreProvider` is PURE (no I/O, no clock, no globals) over its three
 * inputs so it is trivially testable to 100% branch coverage and the
 * scoring trace it explains is fully reproducible for the caller.
 */
import type {
	IProviderAvailability,
	IProviderCapabilities,
	RoutingMode,
} from '@mcp-vertex/core/public';

import type { IRoutingHint } from '../types';

/**
 * Cost-tier target per mode (CRITICAL N10): `review` is tier 3 (not 4),
 * so a review-mode task with `costPreference: "minimize"` picks a cheaper
 * model than a plan-mode task. Frozen so no caller can mutate it.
 */
export const MODE_TIER: Readonly<Record<RoutingMode, number>> = Object.freeze({
	plan: 4,
	review: 3,
	implement: 2,
	explore: 1,
});

/** Penalty applied to a provider that is not `available`. */
export const UNAVAILABLE_SCORE = -10;

/**
 * Score how well a provider fits a task hint given its current health.
 * An unavailable provider is hard-penalised to `-10` so it is only ever
 * chosen when literally nothing else exists.
 */
export const scoreProvider = (
	p: IProviderCapabilities,
	hint: IRoutingHint,
	health: IProviderAvailability,
): number => {
	if (health.state !== 'available') return UNAVAILABLE_SCORE;

	let score = 0;
	for (const cap of hint.capabilities) {
		if (p.strengths.includes(cap)) score += 2;
		if (p.weaknesses.includes(cap)) score -= 3;
	}

	const targetTier = MODE_TIER[hint.mode];
	if (p.costTier >= targetTier) score += 1;
	if (p.costTier > targetTier + 1) score -= 1;
	if (hint.costPref === 'minimize' && p.costTier <= 2) score += 2;
	if (hint.costPref === 'maximize' && p.costTier >= 4) score += 2;
	return score;
};

/**
 * Same math as {@link scoreProvider} but also emits the human-readable
 * reasons that make up the score, for the transparency trace returned by
 * `advise_routing`. Kept alongside the scorer so the two never drift.
 */
export const explainScore = (
	p: IProviderCapabilities,
	hint: IRoutingHint,
	health: IProviderAvailability,
): { readonly score: number; readonly reasons: readonly string[] } => {
	if (health.state !== 'available') {
		return {
			score: UNAVAILABLE_SCORE,
			reasons: [`unavailable (${health.state}) → ${UNAVAILABLE_SCORE}`],
		};
	}

	const reasons: string[] = [];
	let score = 0;
	for (const cap of hint.capabilities) {
		if (p.strengths.includes(cap)) {
			score += 2;
			reasons.push(`+2 strength:${cap}`);
		}
		if (p.weaknesses.includes(cap)) {
			score -= 3;
			reasons.push(`-3 weakness:${cap}`);
		}
	}

	const targetTier = MODE_TIER[hint.mode];
	if (p.costTier >= targetTier) {
		score += 1;
		reasons.push(`+1 costTier≥target(${targetTier})`);
	}
	if (p.costTier > targetTier + 1) {
		score -= 1;
		reasons.push(`-1 costTier>target+1`);
	}
	if (hint.costPref === 'minimize' && p.costTier <= 2) {
		score += 2;
		reasons.push('+2 minimize & cheap tier');
	}
	if (hint.costPref === 'maximize' && p.costTier >= 4) {
		score += 2;
		reasons.push('+2 maximize & premium tier');
	}
	if (reasons.length === 0) reasons.push('0 no matching signals');
	return { score, reasons };
};

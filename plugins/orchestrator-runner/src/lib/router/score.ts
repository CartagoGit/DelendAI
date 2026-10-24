/**
 * score.ts — the deterministic provider scorer (CRITICAL C5).
 *
 * The score itself is core's one ranking (`scoreModel`), which every
 * component that chooses a model asks; this module adapts the runner's
 * roster entry, health and routing hint to it. Pure, so the trace it
 * explains is reproducible for the caller.
 */
import {
	COST_PREFERENCE_DIAL,
	MODE_TIER,
	UNAVAILABLE_SCORE,
} from '@delendai/core/contracts';
import type {
	IProviderAvailability,
	IProviderCapabilities,
} from '@delendai/core/public';
import { scoreModel } from '@delendai/core/runtime';

import type { IRoutingHint } from '../types';

export { MODE_TIER, UNAVAILABLE_SCORE };

/** The roster entry and its health as core's one ranking sees them. */
const asRankable = (
	p: IProviderCapabilities,
	health: IProviderAvailability,
) => ({
	id: p.id,
	costTier: p.costTier,
	strengths: p.strengths,
	weaknesses: p.weaknesses,
	available: health.state === 'available',
	unavailableReason: health.state,
});

/**
 * Same score as {@link scoreProvider}, with the reason for each term, for
 * the transparency trace `advise_routing` returns.
 */
export const explainScore = (
	p: IProviderCapabilities,
	hint: IRoutingHint,
	health: IProviderAvailability,
): { readonly score: number; readonly reasons: readonly string[] } =>
	scoreModel(
		asRankable(p, health),
		{ capabilities: hint.capabilities, mode: hint.mode },
		COST_PREFERENCE_DIAL[hint.costPref],
	);

/**
 * Score how well a provider fits a task hint given its current health,
 * by core's one ranking (`scoreModel`): capability matches, the mode's cost
 * target, and the cost preference as a position of the cost↔quality dial.
 * An unavailable provider is hard-penalised so it is only ever chosen when
 * nothing else exists.
 */
export const scoreProvider = (
	p: IProviderCapabilities,
	hint: IRoutingHint,
	health: IProviderAvailability,
): number => explainScore(p, hint, health).score;

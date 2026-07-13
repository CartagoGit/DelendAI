/**
 * fallback.ts — the fallback chain planner (CRITICAL I7).
 *
 * Pure over its inputs: given the roster, the availability mirror and a
 * routing hint, it returns an ORDERED list of decisions to try. The runner
 * executes them head-first; on a failure it moves to the next entry.
 *
 * Two strategies (both re-use the canonical `explainScore` so the chain
 * never drifts from `advise_routing`'s ranking):
 *
 *  - `rerank` (DEFAULT): each hop excludes every already-tried provider and
 *    RELAXES the cost-tier cap by 1 (starts at the primary winner's tier),
 *    then picks the highest-scoring remaining provider within the cap.
 *  - `tier-down`: each hop walks STRICTLY downward — it only considers
 *    providers whose `costTier` is below the previously-tried provider's.
 *
 * The chain is bounded by `maxDepth` (primary + up to maxDepth-1 fallbacks).
 */
import type {
	IProviderAvailability,
	IProviderCapabilities,
	IRoutingDecision,
	IRoutingScoreEntry,
} from '@mcp-vertex/core/public';

import { strategyForKind } from '../router/advise';
import { explainScore } from '../router/score';
import type { IRoutingHint } from '../types';

export type FallbackStrategy = 'rerank' | 'tier-down';

export interface IFallbackPlanInput {
	readonly providers: readonly IProviderCapabilities[];
	readonly availabilityOf: (id: string) => IProviderAvailability;
	readonly hint: IRoutingHint;
	readonly prompt: string;
	readonly sessionId: string;
	readonly strategy: FallbackStrategy;
	readonly maxDepth: number;
}

interface IScored {
	readonly provider: IProviderCapabilities;
	readonly score: number;
	readonly reasons: readonly string[];
}

const rankAll = (input: IFallbackPlanInput): IScored[] =>
	input.providers
		.map((provider) => {
			const { score, reasons } = explainScore(
				provider,
				input.hint,
				input.availabilityOf(provider.id),
			);
			return { provider, score, reasons };
		})
		.filter((r) => r.score > -10)
		.sort((a, b) => b.score - a.score);

const decisionFor = (
	scored: IScored,
	input: IFallbackPlanInput,
	scoringTrace: readonly IRoutingScoreEntry[],
): IRoutingDecision => ({
	strategy: strategyForKind(scored.provider.kind),
	targetProvider: scored.provider,
	mode: input.hint.mode,
	prompt: input.prompt,
	invoke: scored.provider.invoke,
	rationale: `Selected ${scored.provider.id} (${scored.provider.modelId}, tier ${scored.provider.costTier}) for a ${input.hint.mode} task with costPreference "${input.hint.costPref}".`,
	estimatedCostTier: scored.provider.costTier,
	alternates: [],
	scoringTrace,
	sessionId: input.sessionId,
});

/**
 * Build the ordered chain of decisions the runner should try. The first
 * carries the full scoring trace; fallbacks are self-contained (no nested
 * trace/alternates) so the payload stays bounded.
 */
export const planFallbackChain = (
	input: IFallbackPlanInput,
): readonly IRoutingDecision[] => {
	const ranked = rankAll(input);
	if (ranked.length === 0) return [];

	const scoringTrace: readonly IRoutingScoreEntry[] = ranked.map((r) => ({
		provider: r.provider.id,
		score: r.score,
		reasons: r.reasons,
	}));

	const primary = ranked[0];
	if (primary === undefined) return [];
	const chain: IRoutingDecision[] = [
		decisionFor(primary, input, scoringTrace),
	];
	const tried = new Set<string>([primary.provider.id]);
	let lastTier = primary.provider.costTier;
	const baseTier = primary.provider.costTier;

	for (let hop = 1; hop < input.maxDepth; hop += 1) {
		let candidate: IScored | undefined;
		if (input.strategy === 'rerank') {
			// Relax the cap by 1 per hop; pick the best untried within it.
			const cap = baseTier + hop;
			candidate = ranked.find(
				(r) => !tried.has(r.provider.id) && r.provider.costTier <= cap,
			);
		} else {
			// tier-down: strictly cheaper than the last tried provider.
			candidate = ranked
				.filter(
					(r) =>
						!tried.has(r.provider.id) &&
						r.provider.costTier < lastTier,
				)
				.sort((a, b) => b.provider.costTier - a.provider.costTier)[0];
		}
		if (candidate === undefined) break;
		tried.add(candidate.provider.id);
		lastTier = candidate.provider.costTier;
		chain.push(decisionFor(candidate, input, []));
	}

	return chain;
};

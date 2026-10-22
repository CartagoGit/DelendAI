/**
 * rank-providers.ts — the pure ranking core.
 *
 * SRP: turns "the reachable roster + the user's cost↔quality dial + an
 * optional pin" into a ranked recommendation with a rationale per row. No
 * I/O, no clock, no globals — a sort key and an explanation, nothing more.
 *
 * The dial is the natural, industry-standard knob (OpenRouter/NotDiamond's
 * Auto Router `cost_quality_tradeoff`, RouteLLM's cost↔quality trade): 0 asks
 * for the strongest model regardless of cost, 10 for the cheapest reachable.
 *
 * The score is core's one ranking (`rankModels`), shared with the runner:
 * it is MONOTONIC in cost, so it never surprises the user — below 5 a more
 * capable (pricier) provider ranks higher, above 5 a cheaper one always
 * does, at 5 cost is a wash and ties break cheapest-first — and a measured
 * win rate for the task refines it.
 */
import { rankModels } from '@delendai/core/runtime';

import type { IProviderCandidate } from '../contracts/interfaces/roster.interface';
import type {
	IRankInput,
	IRankedProvider,
} from '../contracts/interfaces/ranking.interface';

const DEFAULT_DIAL = 7;

const clampDial = (value: number): number =>
	Number.isFinite(value) ? Math.max(0, Math.min(10, value)) : DEFAULT_DIAL;

/** The lean the dial expresses, for the human rationale. */
const leanFor = (dial: number): string =>
	dial >= 7 ? 'leaning cheaper' : dial <= 3 ? 'leaning stronger' : 'balanced';

const describe = (
	candidate: IProviderCandidate,
	dial: number,
	pinned: boolean,
): string =>
	pinned
		? 'pinned by you — always used for this task'
		: `best value for your cost↔quality setting (${dial}/10, ${leanFor(dial)}): cost tier ${candidate.costTier} via ${candidate.source.toUpperCase()}`;

/**
 * Rank the reachable providers for the request, by core's one ranking
 * (`rankModels`): every candidate, best-first, each with a score and a
 * plain-language rationale. A reachable user pin is always placed first
 * (the user decides); ties break cheapest-first then by id.
 */
export const rankProviders = (
	input: IRankInput,
): readonly IRankedProvider[] => {
	const dial = clampDial(input.costQualityTradeoff);
	const byId = new Map(
		input.available.map((candidate) => [candidate.id, candidate]),
	);
	return rankModels(
		input.available.map((candidate) => ({
			id: candidate.id,
			costTier: candidate.costTier,
			available: true,
		})),
		{},
		{ dial, pinnedId: input.pinnedId, winRates: input.calibration },
	).flatMap((ranked): IRankedProvider[] => {
		const candidate = byId.get(ranked.id);
		if (candidate === undefined) return [];
		const calibrationNote =
			ranked.evidence !== undefined
				? ` · measured win-rate ${Math.round(ranked.evidence.winRate * 100)}%`
				: '';
		return [
			{
				candidate,
				score: ranked.score,
				rationale:
					describe(candidate, dial, ranked.pinned) + calibrationNote,
				pinned: ranked.pinned,
			},
		];
	});
};

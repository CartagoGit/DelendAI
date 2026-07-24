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
 * Scoring is MONOTONIC so it never surprises the user:
 *   score = costTier × (5 − dial)
 *   - dial < 5 → positive weight on tier → a MORE capable/expensive provider
 *     ranks higher (you asked for quality).
 *   - dial > 5 → negative weight → a CHEAPER provider ranks higher, always;
 *     leaning cheaper can never rank a pricier provider above a cheaper one.
 *   - dial = 5 → neutral; ties break cheapest-first.
 * Capability/quality calibration refines the per-provider signal later
 * (f00119 S4); until then the cost tier is the honest axis.
 */
import { CALIBRATION_WEIGHT } from '../contracts/constants/calibration.constant';
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
 * Rank the reachable providers for the request. Returns every candidate,
 * best-first, each with a score + a plain-language rationale. A reachable
 * user pin is always placed first (the user decides); ties break
 * cheapest-first then by id so the order is stable and reproducible.
 */
export const rankProviders = (
	input: IRankInput,
): readonly IRankedProvider[] => {
	const dial = clampDial(input.costQualityTradeoff);
	const pinnedReachable =
		input.pinnedId !== undefined &&
		input.available.some((c) => c.id === input.pinnedId);

	const ranked = input.available.map((candidate): IRankedProvider => {
		const pinned = pinnedReachable && candidate.id === input.pinnedId;
		const fitScore = candidate.costTier * (5 - dial);
		// S4: blend the measured win-rate (when the provider has enough
		// samples) so a proven winner is nudged up. Bounded + explainable.
		const winRate = input.calibration?.get(candidate.id);
		const calibrationBonus =
			winRate !== undefined ? CALIBRATION_WEIGHT * (winRate - 0.5) : 0;
		const baseScore = fitScore + calibrationBonus;
		const calibrationNote =
			winRate !== undefined
				? ` · measured win-rate ${Math.round(winRate * 100)}%`
				: '';
		return {
			candidate,
			// A pin gets a large constant boost so it always sorts first,
			// while keeping the underlying fit score visible for transparency.
			score: pinned ? 1000 + baseScore : baseScore,
			rationale: describe(candidate, dial, pinned) + calibrationNote,
			pinned,
		};
	});

	return [...ranked].sort(
		(a, b) =>
			b.score - a.score ||
			a.candidate.costTier - b.candidate.costTier ||
			a.candidate.id.localeCompare(b.candidate.id),
	);
};

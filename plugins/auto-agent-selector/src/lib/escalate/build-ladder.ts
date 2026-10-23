/**
 * build-ladder.ts — the pure escalation-ladder planner.
 *
 * SRP: given the RANKED roster (best-value first, from `rankProviders`) + a
 * cost ceiling + a max depth, produce the ordered ladder to try. Rung 1 is
 * the recommended pick; each subsequent rung is the cheapest provider that is
 * STRICTLY STRONGER (higher cost tier) than the previous rung and still within
 * the ceiling — so a failure escalates UP, never sideways or down, and never
 * past what the user is willing to pay. No I/O; a plan, nothing more.
 */
import type {
	IBuildLadderInput,
	IEscalationPlan,
	IEscalationRung,
} from '../contracts/interfaces/escalation.interface';

const clampCeiling = (value: number | undefined): number =>
	value === undefined || !Number.isFinite(value)
		? 5
		: Math.max(1, Math.min(5, Math.floor(value)));

const clampDepth = (value: number | undefined): number =>
	value === undefined || !Number.isFinite(value)
		? 3
		: Math.max(1, Math.min(10, Math.floor(value)));

/**
 * Build the escalation plan. The primary (rung 1) is the top-ranked provider
 * whose tier is within the ceiling; if the recommended pick is itself over the
 * ceiling, the cheapest within-ceiling provider is used instead (the user's
 * budget always wins). Deterministic: stronger rungs are chosen cheapest-first
 * so the escalation climbs one sensible step at a time.
 */
export const buildEscalationLadder = (
	input: IBuildLadderInput,
): IEscalationPlan => {
	const costCeiling = clampCeiling(input.costCeiling);
	const maxDepth = clampDepth(input.maxDepth);

	const withinCeiling = input.ranked.filter((c) => c.costTier <= costCeiling);
	const ladder: IEscalationRung[] = [];

	// Rung 1: the best-value provider the budget allows (ranked order already
	// encodes the dial; take the first within the ceiling).
	const primary = withinCeiling[0];
	if (primary === undefined) {
		return { ladder, costCeiling, maxDepth };
	}
	ladder.push({
		candidate: primary,
		step: 1,
		rationale: `start here — best value within your cost ceiling (tier ${primary.costTier})`,
	});

	// Escalations: each next rung is the cheapest provider strictly stronger
	// than the previous rung, still within the ceiling and not already used.
	const used = new Set<string>([primary.id]);
	let prevTier = primary.costTier;
	while (ladder.length < maxDepth) {
		const stronger = withinCeiling
			.filter((c) => !used.has(c.id) && c.costTier > prevTier)
			.sort(
				(a, b) => a.costTier - b.costTier || a.id.localeCompare(b.id),
			);
		const next = stronger[0];
		if (next === undefined) break;
		ladder.push({
			candidate: next,
			step: ladder.length + 1,
			rationale: `escalate here if the previous provider failed the acceptance gate (stronger, tier ${next.costTier})`,
		});
		used.add(next.id);
		prevTier = next.costTier;
	}

	return { ladder, costCeiling, maxDepth };
};

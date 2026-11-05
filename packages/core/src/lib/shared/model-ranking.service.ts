/**
 * model-ranking.service.ts — the one ranking every component that chooses
 * a model asks.
 *
 * `orchestrator-runner` scored capabilities, the task's mode and a cost
 * preference; `auto-agent-selector` sorted by a cost↔quality dial blended
 * with win rates; the same task routed two ways depending on which tool
 * was called. One score now: capability matches, the mode's cost target,
 * the dial as a continuous cost term (a named preference is a dial
 * position), the measured win rate for the kind of task, and whether the
 * provider can work now. Every term is given as a reason.
 */
import {
	CALIBRATION_WEIGHT,
	DIAL_COST_WEIGHT,
	MID_COST_TIER,
	MIN_CALIBRATION_SAMPLES,
	MODE_TIER,
	NEUTRAL_DIAL,
	PIN_BOOST,
	UNAVAILABLE_SCORE,
} from '../contracts/constants/model-ranking.constant';
import type { IModelOutcome } from '../contracts/interfaces/model-outcome.interface';
import type {
	IModelWinRate,
	IRankableModel,
	IRankedModel,
	IRankTask,
} from '../contracts/interfaces/model-ranking.interface';

const clampDial = (dial: number): number =>
	Number.isFinite(dial) ? Math.max(0, Math.min(10, dial)) : NEUTRAL_DIAL;

const signed = (value: number): string =>
	`${value >= 0 ? '+' : ''}${Number(value.toFixed(2)).toString()}`;

/**
 * Each provider's win rate from the outcome store: accepted over judged
 * (accepted or rejected), for one kind of task when named, kept only with
 * enough samples to mean something.
 */
export const winRatesOf = (
	outcomes: readonly IModelOutcome[],
	taskKind?: string,
	minSamples: number = MIN_CALIBRATION_SAMPLES,
): ReadonlyMap<string, IModelWinRate> => {
	const tally = new Map<string, { accepted: number; judged: number }>();
	for (const outcome of outcomes) {
		if (outcome.outcome !== 'accepted' && outcome.outcome !== 'rejected')
			continue;
		if (taskKind !== undefined && outcome.taskKind !== taskKind) continue;
		const entry = tally.get(outcome.providerId) ?? {
			accepted: 0,
			judged: 0,
		};
		entry.judged += 1;
		if (outcome.outcome === 'accepted') entry.accepted += 1;
		tally.set(outcome.providerId, entry);
	}
	return new Map(
		[...tally]
			.filter(([, entry]) => entry.judged >= minSamples)
			.map(([id, entry]) => [
				id,
				{
					winRate: entry.accepted / entry.judged,
					samples: entry.judged,
				},
			]),
	);
};

/** One provider's score for a task, with the reason for each term. */
export const scoreModel = (
	model: IRankableModel,
	task: IRankTask,
	dial: number,
	evidence?: IModelWinRate,
): { readonly score: number; readonly reasons: readonly string[] } => {
	if (!model.available) {
		return {
			score: UNAVAILABLE_SCORE,
			reasons: [
				`unavailable${model.unavailableReason === undefined ? '' : ` (${model.unavailableReason})`} → ${UNAVAILABLE_SCORE}`,
			],
		};
	}
	const reasons: string[] = [];
	let score = 0;
	for (const capability of task.capabilities ?? []) {
		if (model.strengths?.includes(capability)) {
			score += 2;
			reasons.push(`+2 strength:${capability}`);
		}
		if (model.weaknesses?.includes(capability)) {
			score -= 3;
			reasons.push(`-3 weakness:${capability}`);
		}
	}
	if (task.mode !== undefined) {
		const target = MODE_TIER[task.mode];
		if (model.costTier >= target) {
			score += 1;
			reasons.push(`+1 costTier≥target(${target})`);
		}
		if (model.costTier > target + 1) {
			score -= 1;
			reasons.push('-1 costTier>target+1');
		}
	}
	const leaning = clampDial(dial);
	const cost =
		-DIAL_COST_WEIGHT *
		(leaning - NEUTRAL_DIAL) *
		(model.costTier - MID_COST_TIER);
	if (cost !== 0) {
		score += cost;
		reasons.push(
			`${signed(cost)} cost↔quality ${leaning}/10 at tier ${model.costTier}`,
		);
	}
	if (evidence !== undefined) {
		const bonus = CALIBRATION_WEIGHT * (evidence.winRate - 0.5);
		score += bonus;
		reasons.push(
			`${signed(bonus)} measured win rate ${Math.round(evidence.winRate * 100)}% over ${evidence.samples}`,
		);
	}
	if (reasons.length === 0) reasons.push('0 no matching signals');
	return { score, reasons };
};

/**
 * The providers for a task, best first. A reachable pin sorts first; ties
 * break cheapest first, then by id, so the order is stable.
 */
export const rankModels = (
	models: readonly IRankableModel[],
	task: IRankTask,
	options: {
		readonly dial: number;
		readonly pinnedId?: string | undefined;
		readonly winRates?: ReadonlyMap<string, IModelWinRate> | undefined;
	},
): readonly IRankedModel[] => {
	const pinReachable =
		options.pinnedId !== undefined &&
		models.some(
			(model) => model.id === options.pinnedId && model.available,
		);
	return models
		.map((model): IRankedModel & { readonly costTier: number } => {
			const evidence = options.winRates?.get(model.id);
			const { score, reasons } = scoreModel(
				model,
				task,
				options.dial,
				evidence,
			);
			const pinned = pinReachable && model.id === options.pinnedId;
			return {
				id: model.id,
				costTier: model.costTier,
				score: pinned ? PIN_BOOST + score : score,
				reasons: pinned ? ['pinned', ...reasons] : reasons,
				pinned,
				...(evidence === undefined ? {} : { evidence }),
			};
		})
		.sort(
			(a, b) =>
				b.score - a.score ||
				a.costTier - b.costTier ||
				a.id.localeCompare(b.id),
		)
		.map(({ costTier: _costTier, ...ranked }) => ranked);
};

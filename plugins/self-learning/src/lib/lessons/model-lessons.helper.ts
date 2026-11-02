/**
 * model-lessons.helper.ts — which model did each kind of task best, from
 * the shared outcome store every ranking reads.
 *
 * The answer is the store's, not a new measurement: accepted over judged
 * outcomes per provider for each task kind, the cost per accepted result
 * where costs were recorded, and the number of outcomes it rests on. An
 * answer on fewer judged outcomes than the ranking trusts says so.
 */
import {
	MIN_CALIBRATION_SAMPLES,
	type IModelOutcome,
} from '@delendai/core/contracts';

import type { ILesson } from '../contracts/interfaces/lesson.interface';

const HIGH = 0.7;
const MEDIUM = 0.4;
const PERCENT = 100;

interface ITally {
	accepted: number;
	judged: number;
	costed: number;
	cost: number;
	unit: string | undefined;
	recent: number;
	lastSeenMs: number;
}

/** One lesson per kind of task: the provider that did it best. */
export const modelLessons = (
	outcomes: readonly IModelOutcome[],
	options: { readonly nowMs: number; readonly recencyWindowMs: number },
): readonly ILesson[] => {
	const byKind = new Map<string, Map<string, ITally>>();
	for (const outcome of outcomes) {
		if (outcome.outcome !== 'accepted' && outcome.outcome !== 'rejected')
			continue;
		const kind = outcome.taskKind ?? 'any task';
		const providers = byKind.get(kind) ?? new Map<string, ITally>();
		const tally = providers.get(outcome.providerId) ?? {
			accepted: 0,
			judged: 0,
			costed: 0,
			cost: 0,
			unit: undefined,
			recent: 0,
			lastSeenMs: 0,
		};
		const at = Date.parse(outcome.at);
		tally.judged += 1;
		if (outcome.outcome === 'accepted') {
			tally.accepted += 1;
			if (
				Number.isFinite(at) &&
				options.nowMs - at <= options.recencyWindowMs
			)
				tally.recent += 1;
			if (
				outcome.cost !== undefined &&
				outcome.cost.kind !== 'included-in-plan'
			) {
				tally.costed += 1;
				tally.cost += outcome.cost.amount;
				tally.unit = outcome.cost.unit;
			}
		}
		if (Number.isFinite(at))
			tally.lastSeenMs = Math.max(tally.lastSeenMs, at);
		providers.set(outcome.providerId, tally);
		byKind.set(kind, providers);
	}
	return [...byKind].flatMap(([kind, providers]) => {
		const best = [...providers].sort(
			([aId, a], [bId, b]) =>
				b.accepted / b.judged - a.accepted / a.judged ||
				b.judged - a.judged ||
				aId.localeCompare(bId),
		)[0];
		if (best === undefined) return [];
		const [providerId, tally] = best;
		const rate = tally.accepted / tally.judged;
		const enough = tally.judged >= MIN_CALIBRATION_SAMPLES;
		const costText =
			tally.costed > 0 && tally.unit !== undefined
				? `, about ${(tally.cost / tally.costed).toFixed(3)} ${tally.unit} per accepted result`
				: '';
		const thin = enough
			? ''
			: ` — only ${tally.judged} judged outcome(s), fewer than the ${MIN_CALIBRATION_SAMPLES} the ranking trusts`;
		const score = Number(rate.toFixed(2));
		return [
			{
				kind: 'model-for-task' as const,
				subject: kind,
				claim: `${providerId} did best at ${kind}: ${tally.accepted} of ${tally.judged} accepted (${Math.round(rate * PERCENT)}%)${costText}${thin}.`,
				confidence: {
					support: tally.accepted,
					counterExamples: tally.judged - tally.accepted,
					recentSupport: tally.recent,
					score,
					band: !enough
						? 'low'
						: score >= HIGH
							? 'high'
							: score >= MEDIUM
								? 'medium'
								: 'low',
				},
				lastSeenMs: tally.lastSeenMs,
				evidence: [],
				evidenceCount: tally.judged,
			},
		];
	});
};

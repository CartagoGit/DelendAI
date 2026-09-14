/**
 * confidence.helper.ts — how much weight a lesson carries (q00014 S5).
 *
 * Three countable inputs and no model:
 *
 *   - **support** — how many observations say it happened;
 *   - **recency** — how many of them are recent, because a project
 *     changes and a lesson about a command nobody has run since June is
 *     a liability rather than knowledge;
 *   - **counter-examples** — how many observations of the same subject
 *     say the opposite, because a lesson that stops reproducing must
 *     degrade on its own rather than wait for somebody to notice.
 *
 * The shape is deliberately boring. The proposal's non-goal says this
 * stays statistics over the project's own events, and a score a reader
 * can recompute by hand is the only kind they will trust enough to act
 * on.
 */

import type { ILessonConfidence } from '../contracts/interfaces/lesson.interface';

export {
	DEFAULT_MINIMUM_SUPPORT,
	DEFAULT_RECENCY_WINDOW_MS,
} from '../contracts/constants/lesson.constant';

const clamp = (value: number): number => Math.min(1, Math.max(0, value));

const round2 = (value: number): number => Math.round(value * 100) / 100;

const bandOf = (score: number): ILessonConfidence['band'] =>
	score >= 0.7 ? 'high' : score >= 0.4 ? 'medium' : 'low';

/**
 * Score a claim from its evidence.
 *
 * `support / (support + counterExamples)` is the agreement rate, and
 * the recency share scales it: a claim every observation agrees with,
 * none of them recent, is not worth acting on today. Support itself
 * saturates at six — the difference between three sightings and six is
 * real, between sixty and six hundred it is noise.
 */
export const scoreConfidence = (input: {
	readonly support: number;
	readonly counterExamples: number;
	readonly recentSupport: number;
}): ILessonConfidence => {
	const support = Math.max(0, input.support);
	const counterExamples = Math.max(0, input.counterExamples);
	const recentSupport = Math.min(Math.max(0, input.recentSupport), support);

	if (support === 0) {
		return {
			support: 0,
			counterExamples,
			recentSupport: 0,
			score: 0,
			band: 'low',
		};
	}

	const agreement = support / (support + counterExamples);
	const volume = clamp(support / 6);
	const recency = clamp(recentSupport / support);
	// Agreement is the claim, volume and recency are how much of it to
	// believe today. Multiplying keeps any one of them able to sink it:
	// a claim nothing contradicts but nothing recent supports scores low,
	// and so does one seen often and contradicted as often.
	const score = round2(agreement * (0.4 + 0.3 * volume + 0.3 * recency));

	return {
		support,
		counterExamples,
		recentSupport,
		score,
		band: bandOf(score),
	};
};

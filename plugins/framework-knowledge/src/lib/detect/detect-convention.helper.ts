// detect-convention.helper.ts — turn counts of what a project already
// does into the convention it follows, with how sure that is.
//
// Pure: the caller counts (94 components with external templates, 2
// inline) and this decides whether that is a convention. A new agent then
// adopts the shape the project already has instead of its own habits.

import { CONVENTION_THRESHOLDS } from '../contracts/constants/convention.constant';
import type {
	IConventionObservation,
	IDetectedConvention,
} from '../contracts/interfaces/convention.interface';

/** Confidence is reported to two decimals: finer reads as false precision. */
const roundShare = (share: number): number => Math.round(share * 100) / 100;

/**
 * The dominant value and its share of everything counted, or `undefined`
 * when the counts do not amount to a convention: too few occurrences, a
 * tie at the top, or a leader that holds too small a share. Answering
 * "none" is deliberate — a weak habit fed to the resolver would outrank
 * the framework's own recommendation.
 */
export const detectConvention = (
	observations: readonly IConventionObservation[],
	thresholds: {
		readonly minimumSample: number;
		readonly minimumConfidence: number;
	} = CONVENTION_THRESHOLDS,
): IDetectedConvention | undefined => {
	const counted = observations.filter((entry) => entry.count > 0);
	const sample = counted.reduce((sum, entry) => sum + entry.count, 0);
	if (sample < thresholds.minimumSample) return undefined;
	const ranked = [...counted].sort((left, right) => right.count - left.count);
	const [leader, runnerUp] = ranked;
	if (leader === undefined) return undefined;
	if (runnerUp !== undefined && runnerUp.count === leader.count) {
		return undefined;
	}
	const confidence = leader.count / sample;
	if (confidence < thresholds.minimumConfidence) return undefined;
	return { value: leader.value, confidence: roundShare(confidence), sample };
};

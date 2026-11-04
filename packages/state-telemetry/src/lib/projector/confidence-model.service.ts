import {
	CONFIDENCE_CAP_CEILING,
	CONFIDENCE_CAP_FLOOR,
	WORK_PHASE_ORDER,
} from './contracts/constants/work-progress.constant';
import type { IAcceptanceCompleteness } from './contracts/interfaces/work-progress.interface';

const HALF = 2;

/** Largest variance a window of ranks can have: half the rank span, squared. */
const MAX_RANK_VARIANCE = ((WORK_PHASE_ORDER.length - 1) / HALF) ** HALF;

export const rankVariance = (ranks: readonly number[]): number => {
	if (ranks.length === 0) return 0;
	const mean = ranks.reduce((sum, r) => sum + r, 0) / ranks.length;
	return ranks.reduce((sum, r) => sum + (r - mean) ** HALF, 0) / ranks.length;
};

/**
 * The ceiling confidence may reach: 0.5 with no criterion checked, 1 with all
 * checked. A slice with no criteria has nothing to hold it back, so it is uncapped.
 */
export const acceptanceCap = (acceptance: IAcceptanceCompleteness): number => {
	if (acceptance.count <= 0) return CONFIDENCE_CAP_CEILING;
	const done = Math.min(Math.max(acceptance.done, 0), acceptance.count);
	return (
		CONFIDENCE_CAP_FLOOR +
		(CONFIDENCE_CAP_CEILING - CONFIDENCE_CAP_FLOOR) *
			(done / acceptance.count)
	);
};

/** `1 - normalised variance` of the window, capped by acceptance; 0 with no events. */
export const computeConfidence = (
	recentRanks: readonly number[],
	acceptance: IAcceptanceCompleteness,
): number => {
	if (recentRanks.length === 0) return 0;
	const raw = 1 - rankVariance(recentRanks) / MAX_RANK_VARIANCE;
	return Math.min(Math.max(raw, 0), acceptanceCap(acceptance));
};

/** Uncertainty is defined as the complement of confidence. */
export const uncertaintyOf = (confidence: number): number => 1 - confidence;

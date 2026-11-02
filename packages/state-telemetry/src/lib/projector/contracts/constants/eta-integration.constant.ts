/** Why a snapshot carries, or lacks, an ETA. */
export const ETA_REASON_COMPUTED = 'computed';
export const ETA_REASON_INSUFFICIENT_HISTORY = 'insufficient_history';

/**
 * A stalled item whose p80 budget is at least this much spent counts as
 * close to finishing; below it, it is far from done. 0.8 mirrors the p80
 * the budget is measured against.
 */
export const NEAR_COMPLETION_SPENT_FRACTION = 0.8;

/**
 * The least evidence a measured habit needs before it counts as the
 * project's convention. Below either bound the detector answers that
 * there is no convention, and the resolver falls through to the
 * framework's recommendation instead of copying an accident.
 */
export const CONVENTION_THRESHOLDS = {
	/** Fewer occurrences than this are an anecdote, not a habit. */
	minimumSample: 5,
	/** The dominant value's share of the sample, from 0 to 1. */
	minimumConfidence: 0.6,
} as const;

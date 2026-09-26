/**
 * The unit names a reviewer works under. `review` is the one the review
 * procedure names; `close` is what reviewers used for a closing pass
 * before there was one name, and a unit under it is a claim all the same.
 */
export const REVIEW_UNIT_SLICES: ReadonlySet<string> = new Set([
	'review',
	'close',
]);

/** The unit name the procedure tells a reviewer to claim. */
export const REVIEW_UNIT_SLICE = 'review';

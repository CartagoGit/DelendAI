/**
 * Who holds a review claim: the unit that made it, and its agent (x00739).
 * Two instances of one model share an agent name; their units differ.
 */
export interface IReviewClaimHolder {
	readonly agent: string;
	/** The unit's work ref, `refs/heads/…`, whatever form it was read in. */
	readonly unit: string;
}

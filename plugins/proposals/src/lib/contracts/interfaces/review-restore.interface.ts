/** A proposal to return to `review/`, and the verdicts that say why. */
export interface IReviewRestoreCandidate {
	readonly id: string;
	/** The document, under the proposals directory. */
	readonly file: string;
	readonly from: string;
	/** Each slice with a round, with the review-state it records. */
	readonly slices: readonly {
		readonly sliceId: string;
		readonly reviewState: string;
	}[];
	/** The agents whose verdicts sent it back. */
	readonly reviewers: readonly string[];
}

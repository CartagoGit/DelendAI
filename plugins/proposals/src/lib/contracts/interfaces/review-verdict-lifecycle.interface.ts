/** What a review verdict did to the proposal as a whole. */
export interface IReviewVerdictLifecycle {
	/** The approval ended the proposal and `review → done` ran. */
	readonly proposalClosed?: boolean;
	/** Why a close or hand-over transition was refused, when it was. */
	readonly proposalCloseBlocker?: string;
	/** What happens next when the verdict left the proposal in review/ sent back. */
	readonly nextAction?: string;
	/** The submission left no slice to do and the proposal went to `review`. */
	readonly proposalHandedOver?: boolean;
}

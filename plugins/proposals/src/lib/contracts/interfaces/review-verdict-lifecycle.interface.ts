/** What a review verdict did to the proposal as a whole. */
export interface IReviewVerdictLifecycle {
	/** The approval ended the proposal and `review → done` ran. */
	readonly proposalClosed?: boolean;
	/** Why a close or reopen transition was refused, when it was. */
	readonly proposalCloseBlocker?: string;
	/** A change request sent the proposal back to `in-progress`. */
	readonly proposalReopened?: boolean;
}

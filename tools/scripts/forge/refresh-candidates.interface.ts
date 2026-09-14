/** Types for `./refresh-candidates.script`. */

/** One open candidate, reduced to what the decision needs. */
export interface ICandidate {
	readonly ref: string;
	/** True when the ref sits in the policy's publication namespace. */
	readonly ours: boolean;
	/** Commits the integration branch has that this ref does not. */
	readonly behind: number;
	/** True when merging the integration head in would not be trivial. */
	readonly conflicted: boolean;
}

/** What may be done, and the sentence that says why. */
export interface IRefreshVerdict {
	readonly action: 'refresh' | 'report' | 'skip';
	readonly reason: string;
}

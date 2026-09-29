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
	/**
	 * False when this clone holds no common ancestor for the two refs.
	 *
	 * A shallow checkout has one commit and no ancestor, and `git merge`
	 * answers `refusing to merge unrelated histories` — which is not a
	 * conflict and not the author's call. Kept apart from `conflicted`
	 * because the remedy is completely different: deepen the clone, not
	 * read the diff.
	 */
	readonly sharesHistory?: boolean;
}

/** What may be done, and the sentence that says why. */
export interface IRefreshVerdict {
	readonly action: 'refresh' | 'report' | 'skip';
	readonly reason: string;
}

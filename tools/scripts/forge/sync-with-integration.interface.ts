/** Types for `./sync-with-integration.script`. */

/** How far the local integration branch is from the remote one. */
export interface ISyncCounts {
	/** Commits the local branch has that the remote does not. */
	readonly ahead: number;
	/** Commits the remote has that the local branch does not. */
	readonly behind: number;
}

/**
 * What may be done to the local integration branch.
 *
 * `diverged` is the important one: it is the only state in which a naive
 * "sync" destroys something, so it gets its own name rather than being
 * folded into `fast-forward` and discovered later.
 */
export type ILocalSyncVerdict =
	| 'already-current'
	| 'fast-forward'
	| 'ahead'
	| 'diverged';

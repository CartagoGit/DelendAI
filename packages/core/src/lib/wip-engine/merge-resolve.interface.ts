/**
 * Contract shapes for `./merge-resolve`.
 *
 * Split out of the implementation module so the repo's "types and
 * constants live in contracts" convention holds: `merge-resolve.ts` keeps
 * the behaviour, this file keeps the shapes. Re-exported from
 * `merge-resolve.ts`, so no import site changes.
 */

/** One side of an unmerged path. */
export interface IStageEntry {
	readonly mode: string;
	readonly sha: string;
}

/** The three sides of an unmerged path, any of which may be absent. */
export interface IUnmergedPath {
	readonly base?: IStageEntry;
	readonly ours?: IStageEntry;
	readonly theirs?: IStageEntry;
}

/** Outcome of trying to merge every unmerged path. */
export interface IMergeResolution {
	readonly resolved: readonly string[];
	readonly conflicts: readonly string[];
	readonly reason?: string;
}

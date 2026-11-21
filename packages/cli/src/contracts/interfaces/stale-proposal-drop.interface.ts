/** What dropping the stale copies of a moved proposal did: the paths removed, or why nothing was. */
export interface IStaleDrop {
	readonly dropped: readonly string[];
	/** Set when a stale copy holds edits the kept copy lacks: nothing was removed. */
	readonly refusal?: string;
}

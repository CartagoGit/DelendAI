/** Seams the staleness check reads through; the defaults are git and the leveller. */
export interface IStaleProjectionSeams {
	/**
	 * The git tree id of `dir` at `revision` in the repository at `root`,
	 * or `null` when git cannot say (no repository, unknown revision).
	 */
	readonly treeOf?: (
		root: string,
		revision: string,
		dir: string,
	) => Promise<string | null>;
	/**
	 * Whether anything under the proposals directory `dirAbs` was modified
	 * after `sinceMs`, committed or not.
	 */
	readonly changedSince?: (
		dirAbs: string,
		sinceMs: number,
	) => Promise<boolean>;
	/** The clock the check paces itself by; the system's by default. */
	readonly now?: () => number;
}

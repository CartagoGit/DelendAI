/** Contract shapes for `./generated-merge-driver`. */

/** The marker pair that fences a generated region inside an authored file. */
export interface IGeneratedBlock {
	readonly start: string;
	readonly end: string;
}

/** A generated file, and the generators whose output it is. */
export interface IGeneratedMergeRule {
	/**
	 * Repository-relative paths this rule covers. A trailing `/` names a
	 * directory; a leading `/` anchors the path at the repository root.
	 */
	readonly paths: readonly string[];
	/** The `gen:all` steps that write these paths (empty for none). */
	readonly steps: readonly string[];
	/** Why this file is derived, for whoever reads a resolved merge. */
	readonly because: string;
	/**
	 * Present when only a region of the file is generated and the rest is
	 * authored: the authored part is merged for real, the region is not.
	 */
	readonly block?: IGeneratedBlock;
}

/** How one file was resolved, for the driver's report and the specs. */
export type IGeneratedMergeOutcome =
	| 'merged-textually'
	| 'kept-ours-for-regeneration'
	| 'authored-conflict';

/** Contract shapes for `./generated-merge-driver`. */

/** A generated file, and the command that produces it from the tree. */
export interface IGeneratedMergeRule {
	/** Repository-relative paths this rule regenerates. */
	readonly paths: readonly string[];
	/** The `bun run <command>` that produces them. */
	readonly command: string;
	/** Why this file is derived, for whoever reads a resolved merge. */
	readonly because: string;
}

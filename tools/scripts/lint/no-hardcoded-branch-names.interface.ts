/** Contracts for `no-hardcoded-branch-names.script.ts`. */

/** One source file assuming a branch name. */
export interface IBranchLiteralFinding {
	/** Repository-relative path. */
	readonly path: string;
	/** 1-indexed line. */
	readonly line: number;
	/** The literal as written, so the reader sees it. */
	readonly match: string;
}

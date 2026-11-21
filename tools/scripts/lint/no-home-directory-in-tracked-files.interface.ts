/** Contracts for `no-home-directory-in-tracked-files.script.ts`. */

/** One tracked file carrying somebody's home directory. */
export interface IHomePathFinding {
	/** Repository-relative path of the file. */
	readonly path: string;
	/** 1-indexed line the path appears on. */
	readonly line: number;
	/** The matched text, so the reader can see what was found. */
	readonly match: string;
}

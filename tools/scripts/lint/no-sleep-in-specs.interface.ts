/** Contracts for `no-sleep-in-specs.script.ts`. */

/** One spec waiting on the clock. */
export interface ISleepFinding {
	/** Repository-relative path. */
	readonly path: string;
	/** 1-indexed line. */
	readonly line: number;
	/** The matched text, so the reader sees the shape. */
	readonly match: string;
}

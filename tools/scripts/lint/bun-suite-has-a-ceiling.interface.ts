/** Contracts for `bun-suite-has-a-ceiling.script.ts`. */

/** One package script that runs `bun test` without stating a timeout. */
export interface ICeilingFinding {
	/** The `package.json` script name. */
	readonly script: string;
	/** Its command, so the reader sees what to change. */
	readonly command: string;
}

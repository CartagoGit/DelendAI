/**
 * Contract shapes for `./loose-edits-advisory`.
 */

export interface ILooseEditsReading {
	/** Why the checkout is refused for writes, when it is. */
	readonly refusal: string | undefined;
	/** The paths `git status --porcelain` lists there. */
	readonly paths: readonly string[];
}

export interface ILooseEditsAdvisoryDeps {
	readonly read?: (root: string) => Promise<ILooseEditsReading>;
	readonly now?: () => number;
	readonly intervalMs?: number;
	/** The environment the guard reads; `process.env` by default. */
	readonly env?: Readonly<Record<string, string | undefined>>;
}

/**
 * Contract shapes for `./stale-runtime-advisory`.
 */

export interface IStaleRuntimeReading {
	/** The commit the checkout was at when this server started. */
	readonly bootHead: string | undefined;
	/** The commit it is at now. */
	readonly head: string | undefined;
	/** Runtime source files that changed between the two. */
	readonly changed: readonly string[];
}

export interface IStaleRuntimeAdvisoryDeps {
	readonly head?: (root: string) => Promise<string | undefined>;
	readonly changedBetween?: (
		root: string,
		from: string,
		to: string,
	) => Promise<readonly string[]>;
	readonly now?: () => number;
	readonly intervalMs?: number;
}

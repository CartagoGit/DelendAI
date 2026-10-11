/**
 * Contract shapes for `./stale-runtime-advisory`.
 */
import type { CheckpointAdvisoryProvider } from '../contracts/interfaces/checkpoint-advisory.interface';

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

export interface IStaleRuntimeWatch {
	/** For the checkpoint-advisory channel; never waits on git. */
	readonly advisory: CheckpointAdvisoryProvider;
	/**
	 * Why this server runs older code than its checkout, read afresh, or
	 * `undefined` when it runs what the checkout has.
	 */
	readonly behind: () => Promise<string | undefined>;
}

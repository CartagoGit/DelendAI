/**
 * log-store.interface.ts — options for `createLogStore`. Kept under
 * contracts/interfaces per the types-in-contracts convention.
 */

export interface ILogStoreOptions {
	/**
	 * Per-line byte cap passed to `serializeRedactedEvent`. The default
	 * (8 KiB) suits the high-volume main timeline; a curated,
	 * low-volume stream (e.g. the error log) can raise this so a full
	 * stack trace survives instead of being truncated away.
	 */
	readonly maxLineBytes?: number;
}

/** A tail page: the newest events, and how many day-files were read for them. */
export interface ILogTailPage<TEvent> {
	readonly events: readonly TEvent[];
	/** Day-files opened, newest first, until the page was full. */
	readonly filesRead: number;
	/** Day-files retained. */
	readonly filesTotal: number;
}

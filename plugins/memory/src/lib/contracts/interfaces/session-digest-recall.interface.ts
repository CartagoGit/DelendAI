/**
 * Contracts for auto-recall of the latest session digest (f00090 S3).
 *
 * A resumed turn should recall the newest `session-digest:*` note the agent
 * wrote with `memory_compact` instead of re-reading the dropped raw tail.
 * The selector is pure over a minimal structural candidate shape so it does
 * not couple to the full note record — orientation maps store records to
 * candidates.
 */

/** The minimal note fields the selector needs (a structural subset of INote). */
export interface ISessionDigestCandidate {
	readonly title: string;
	readonly body: string;
	/** ISO-8601 creation timestamp; lexical order equals chronological order. */
	readonly createdAt: string;
}

/** The newest session digest, plus its parsed topic. `null` when none exist. */
export interface ISessionDigestSelection {
	readonly title: string;
	/** The `<topic>` portion after the `session-digest:` prefix. */
	readonly topic: string;
	readonly body: string;
	readonly createdAt: string;
}

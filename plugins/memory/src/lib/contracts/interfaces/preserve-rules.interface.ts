/**
 * preserve-rules.interface.ts — the contract for "what a summary is
 * never allowed to drop" (q00014 S6).
 */

/**
 * Why a fragment is load-bearing. The category is not decoration: it
 * decides how loudly a loss is reported, and it is what lets a reader
 * tell "you dropped a nice-to-have" from "you dropped the constraint
 * the user gave you three hours ago".
 */
export type IPreserveCategory =
	/** A choice the user made. Re-deciding it is not ours to do. */
	| 'user-decision'
	/** A boundary the user set: must, never, only, always. */
	| 'user-constraint'
	/** A cause someone established by investigation, not by guessing. */
	| 'diagnosed-cause'
	/** A commit SHA, proposal id, file path, flag, config key. */
	| 'identifier';

/** One fragment that must survive compaction, and why. */
export interface IPreservedFragment {
	readonly category: IPreserveCategory;
	/** The exact text that must survive, normalised for comparison. */
	readonly text: string;
	/** Where it came from, so a reader can go and look. */
	readonly sourceLine: number;
}

/** What a proposed summary lost. */
export interface IPreserveVerdict {
	readonly ok: boolean;
	/** Load-bearing fragments the summary does not carry. */
	readonly dropped: readonly IPreservedFragment[];
	/** Everything the check considered load-bearing. */
	readonly required: readonly IPreservedFragment[];
	/**
	 * What to do about it. Present whether or not the verdict passes,
	 * because "it passed" is also an answer a caller has to act on.
	 */
	readonly nextAction: string;
}

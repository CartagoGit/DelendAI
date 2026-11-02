import type { IReconcilerInputFile } from '@delendai/proposals-sqlite';

/** The proposal markdown tree as one commit holds it. */
export interface IProposalMarkdownAtCommit {
	/** The commit the reference resolved to, once, before anything was read. */
	readonly sha: string;
	readonly files: readonly IReconcilerInputFile[];
}

/**
 * A reference that no longer names the commit a reconcile read. Reported,
 * never acted on: the run is complete for the commit it read, and whether
 * to run again is the caller's decision.
 */
export interface IRefDrift {
	/** The commit the run read. */
	readonly from: string;
	/** What the reference names now; `null` when it names nothing. */
	readonly to: string | null;
	readonly reason: 'ref-moved' | 'ref-gone';
}

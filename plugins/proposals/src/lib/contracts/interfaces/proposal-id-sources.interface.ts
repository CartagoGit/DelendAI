/** Types for `../../proposals/proposal-id-sources`. */

/** Highest numeric id per prefix letter. */
export type IProposalIdCounters = Readonly<Record<string, number>>;

/**
 * Where else a proposal id can already be taken, beyond this checkout's
 * own tree and counter.
 */
export interface IProposalIdSources {
	/** A counter file shared by every worktree of the clone, or `null`. */
	sharedCounterPath(): Promise<string | null>;
	/** Highest id per prefix held outside this checkout's tree. */
	elsewhere(): Promise<IProposalIdCounters>;
}

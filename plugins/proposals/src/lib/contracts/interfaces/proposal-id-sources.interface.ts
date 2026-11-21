/** Types for `../../proposals/proposal-id-sources`. */

/** Highest numeric id per prefix letter. */
export type IProposalIdCounters = Readonly<Record<string, number>>;

/**
 * Where else a proposal id can already be taken, beyond this checkout's
 * own tree and counter.
 */
/**
 * The outcome of claiming an id on the remote: `reserved` (it is ours),
 * `taken` (another session already holds it) or `unavailable` (no remote,
 * offline: nothing could be decided, and the local view stands).
 */
export type IProposalIdReservation = 'reserved' | 'taken' | 'unavailable';

export interface IProposalIdSources {
	/** A counter file shared by every worktree of the clone, or `null`. */
	sharedCounterPath(): Promise<string | null>;
	/** Highest id per prefix held outside this checkout's tree. */
	elsewhere(): Promise<IProposalIdCounters>;
	/**
	 * Claim `id` for this session on the remote, atomically: of two sessions
	 * reserving the same id, exactly one is told `reserved`. Every local view
	 * (counter, worktrees, fetched refs) is blind to an id another machine
	 * allocated a moment ago; only the remote can arbitrate.
	 */
	reserve(id: string): Promise<IProposalIdReservation>;
}

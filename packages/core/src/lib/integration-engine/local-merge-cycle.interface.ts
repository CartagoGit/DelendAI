/** Contract shapes for `./local-merge-cycle`. */

import type { ILocalCertification } from './local-merge-gate.interface';

/** Everything one local-merge attempt needs. */
export interface ILocalMergeCycleInput {
	/** The work ref asking to land, fully qualified. */
	readonly workRef: string;
	/** Remote the integration branch lives on. */
	readonly remote: string;
	/** Absent when nothing certified this candidate at all. */
	readonly certification?: ILocalCertification | undefined;
	/**
	 * Certifies the candidate INSIDE the critical section, against the
	 * integration head the cycle has just read, when no certification was
	 * given. A certification made before that read describes a head that
	 * may already be gone; one made here describes the pair that lands.
	 * `undefined` means nothing could certify it, and nothing lands.
	 */
	readonly certify?:
		| ((
				candidate: ILocalMergeCandidate,
		  ) => Promise<ILocalCertification | undefined>)
		| undefined;
	/**
	 * Whether the cycle deletes the local work ref once it has landed.
	 * Defaults to the policy's `deleteMergedWorkRef`; a caller that ends
	 * the work ref itself (its worktree, its remote copy) says `false`.
	 */
	readonly deleteWorkRef?: boolean | undefined;
}

/** The pair a certification is asked about, and the commit that lands. */
export interface ILocalMergeCandidate {
	readonly integrationSha: string;
	readonly workSha: string;
	/** The integration head with the work merged in: the tree that lands. */
	readonly candidateSha: string;
}

/**
 * What one attempt concluded.
 *
 * Deliberately reuses the pull-request cycle's vocabulary where the
 * meaning is identical — an orchestrator should not need a second
 * scheduling table because the forge happens to have no review object.
 * `revalidating` and `stale` are the two that matter: the first means
 * "nobody has answered for this pair yet", the second means "the head
 * moved under us, try again now".
 */
export type ILocalMergeCycleStatus =
	| 'declined'
	| 'merged'
	| 'stale'
	| 'revalidating'
	| 'blocked'
	| 'RECOVERY_CONFLICT'
	| 'failed';

export interface ILocalMergeCycleOutcome {
	readonly status: ILocalMergeCycleStatus;
	/** One sentence naming the evidence that decided it. */
	readonly reason: string;
	/** The integration sha this attempt was made against. */
	readonly integrationSha?: string | undefined;
	/** The merge commit, present only on `merged`. */
	readonly mergedSha?: string | undefined;
	/** Paths a human must reconcile, present only on `RECOVERY_CONFLICT`. */
	readonly conflicts?: readonly string[] | undefined;
}

/**
 * Contract shapes for `./classify`.
 *
 * Split out of the implementation module so the repo's "types and
 * constants live in contracts" convention holds: `classify.ts` keeps the
 * behaviour, this file keeps the shapes.
 */

/** A branch as the forge reports it. */
export interface IObservedRef {
	readonly name: string;
	/** Seconds since the epoch of its tip, when the forge reports one. */
	readonly updatedAt?: number | undefined;
}

/** A pull request as the forge reports it, reduced to what matters here. */
export interface IObservedPullRequest {
	readonly number: number;
	readonly headRefName: string;
	readonly state: 'open' | 'merged' | 'closed';
}

/** What a ref turned out to be. */
export const REF_ROLES = [
	/** The integration or release branch. Never reaped, never an agent's. */
	'protected',
	/** A publication ref with an open pull request — doing its job. */
	'publication-open',
	/** A publication ref whose pull request is finished. Reapable. */
	'publication-spent',
	/** A publication ref with no pull request at all. */
	'publication-unclaimed',
	/**
	 * A publication ref with no pull request YET, pushed recently enough
	 * that the request it exists for is plausibly still being opened.
	 * Publishing a ref and opening its request are two forge calls with a
	 * gap between them, and a reconcile that lands in that gap was
	 * reporting a healthy candidate as abandoned.
	 */
	'publication-awaiting',
	/** Not ours: the forge's own automation. Reported, never reaped. */
	'foreign',
	/**
	 * A branch outside every namespace the policy knows. Under a shared
	 * checkout this is an agent that took ownership of a branch.
	 */
	'unmanaged',
] as const;
export type IRefRole = (typeof REF_ROLES)[number];

export interface IRefVerdict {
	readonly name: string;
	readonly role: IRefRole;
	/** The pull request that decided the role, when one did. */
	readonly pullRequest?: number | undefined;
	/** Why this role, in one sentence an operator can act on. */
	readonly reason: string;
}

/** How a reconcile pass decides whether a ref has had its chance. */
export interface IReconcileOptions {
	/** Seconds since the epoch to judge ref ages against. */
	readonly now?: number | undefined;
	/**
	 * How long a publication ref may exist without a pull request before
	 * it counts as abandoned rather than in-flight.
	 */
	readonly adoptionGraceSeconds?: number | undefined;
}

/** What a reconcile pass concluded, split by what may be done about it. */
export interface IRefReconciliation {
	readonly verdicts: readonly IRefVerdict[];
	/** Refs that may be deleted, with evidence for each. */
	readonly reapable: readonly IRefVerdict[];
	/**
	 * Refs that are wrong but must NOT be deleted automatically: work
	 * with no pull request may be the only copy of something.
	 */
	readonly needsAttention: readonly IRefVerdict[];
	/**
	 * Refs that are not yet anybody's problem: published inside the
	 * adoption grace and still waiting for their pull request. Reported
	 * so a pass is never silent about them, and excluded from
	 * `needsAttention` so a race does not fail a gate.
	 */
	readonly awaiting: readonly IRefVerdict[];
}

/** Taking over a unit of work somebody else started. */

/** What claiming a ref would do, or did. */
export interface IWorkClaim {
	/** The ref as it stands, logical (no `refs/heads/`). */
	readonly from: string;
	/** The ref it becomes, named after whoever is taking it. */
	readonly to: string;
	/** The identity the ref currently names. */
	readonly heldBy: string;
	/** The identity taking it. */
	readonly claimedBy: string;
	/** The commit both names point at. Unchanged by a claim. */
	readonly sha: string;
	/** The generation it moves to: a different hand is a new attempt. */
	readonly generation: number;
}

/** Why a ref cannot be claimed. */
export interface IWorkClaimRefusal {
	readonly ref: string;
	readonly reason: string;
}

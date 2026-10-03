/** What claiming a proposal in a review unit came to. */
export type IReviewClaimOutcome =
	/** This unit now holds it, by the commit that claims it. */
	| { readonly kind: 'claimed'; readonly commit?: string }
	/** This unit held it already. */
	| { readonly kind: 'already-claimed' }
	/** Other review units hold it: the agents working in them. */
	| { readonly kind: 'held'; readonly by: readonly string[] }
	/** This unit's pack is full: it is published before it claims more. */
	| { readonly kind: 'pack-full'; readonly size: number }
	/** The claim could not be committed. */
	| { readonly kind: 'failed'; readonly reason: string };

/** Why a verdict may not be recorded here, and what to do instead. */
export interface IVerdictClaimRefusal {
	readonly reason: string;
	readonly nextAction: string;
}

/** Types for `./mutation-receipt.service`. */

/** What a claim on a mutation command turned out to be. */
export type IReceiptClaim =
	| { readonly kind: 'started'; readonly command: { readonly id: number } }
	| {
			readonly kind: 'replayed';
			readonly command: { readonly responseJson: string | null };
	  }
	| { readonly kind: 'conflict' }
	| null;

/** The outcome of asking a receipt what to do before the work runs. */
export type IReceiptGate<TOutcome> =
	/** Nothing was decided by the receipt; run the mutation. */
	| { readonly kind: 'proceed' }
	/** A previous identical request already answered; return this. */
	| { readonly kind: 'settled'; readonly outcome: TOutcome };

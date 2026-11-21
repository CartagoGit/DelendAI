/** What reserving a proposal for review on the forge came to. */
export type IReviewReservation =
	| { readonly kind: 'reserved' }
	/** Another unit holds it; `unit` and `agent` name the holder. */
	| { readonly kind: 'taken'; readonly unit: string; readonly agent: string }
	/** No forge to ask (no remote, offline): nothing was reserved or refused. */
	| { readonly kind: 'unavailable' };

/** Who asks for the reservation. */
export interface IReviewReservationHolder {
	/** The review unit, as its work ref without `refs/heads/`. */
	readonly unit: string;
	readonly agent: string;
}

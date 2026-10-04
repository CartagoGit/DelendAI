/**
 * slice-reservation.interface.ts — who holds a slice, as the forge says.
 */

/** What reserving a slice on the forge came to. */
export type ISliceReservation =
	| { readonly kind: 'reserved' }
	/** Another unit holds a slice that covers this one. */
	| {
			readonly kind: 'taken';
			readonly unit: string;
			readonly agent: string;
			readonly slice: string;
	  }
	/** No forge to ask: nothing was reserved, and nothing refused. */
	| { readonly kind: 'unavailable' };

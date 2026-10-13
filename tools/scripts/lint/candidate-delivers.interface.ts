/** Shapes for `./candidate-delivers.script`. */

/** Whether a candidate carries any change at all. */
export type IDeliveryVerdict =
	| { readonly kind: 'delivers'; readonly changed: number }
	| { readonly kind: 'empty'; readonly reason: string };

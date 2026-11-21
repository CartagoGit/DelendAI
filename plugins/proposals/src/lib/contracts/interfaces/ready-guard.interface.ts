/** The answer of the guard on the move to ready. */
export type IReadyGuard =
	| { readonly ok: true }
	| { readonly ok: false; readonly reason: string };

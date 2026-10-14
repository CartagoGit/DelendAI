/**
 * shared-checkout.interface.ts — the answer to "which working copy does
 * this request write to".
 *
 * A request either names its checkout or it does not. When it does, the
 * path has to be proved to belong to this repository before anything is
 * written to it; a refusal says what was checked, because a mistyped
 * path that silently became a write into an unrelated project is the
 * failure this shape exists to stop.
 */

/** Where the resolved checkout came from. */
export type ICheckoutSource = 'request' | 'server';

/** A checkout a write may go to. */
export interface IAcceptedCheckout {
	readonly ok: true;
	/** Absolute path to the working tree the caller's write belongs in. */
	readonly root: string;
	readonly source: ICheckoutSource;
}

/** A checkout a write may not go to, with the reason stated. */
export interface IRefusedCheckout {
	readonly ok: false;
	/** One sentence naming the path and what was checked about it. */
	readonly refusal: string;
}

export type ICheckoutForRequest = IAcceptedCheckout | IRefusedCheckout;

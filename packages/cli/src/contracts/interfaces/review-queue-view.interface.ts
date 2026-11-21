/** What `review` reads of `review_queue`'s answer, and the unit it works in. */

export interface IQueueSlice {
	readonly sliceId: string;
	readonly title?: string;
	readonly verdict: string;
	readonly implementer?: string;
	readonly gate?: string;
	readonly files?: readonly string[];
	readonly acceptance?: readonly string[];
	readonly candidates?: readonly { readonly commit: string }[];
	readonly missing?: string;
}

export interface IQueueProposal {
	readonly id: string;
	readonly file: string;
	readonly slices: readonly IQueueSlice[];
	readonly close?: string;
	readonly claimedBy?: readonly string[];
}

export interface IQueue {
	readonly proposals?: readonly IQueueProposal[];
	/** The unit's pack: published as one pull request once full. */
	readonly pack?: { readonly full: boolean; readonly size: number };
}

export interface IUnit {
	readonly path: string;
	readonly session: string;
	readonly ref: string;
}

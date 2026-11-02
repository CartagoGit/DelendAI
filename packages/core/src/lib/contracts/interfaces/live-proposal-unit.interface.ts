/** A live unit of work, as a caller's tool call finds it. */
export interface ILiveProposalUnit {
	readonly ref: string;
	readonly path: string;
	readonly agent: string;
	readonly kind: string;
}

/** Which unit of work a call that named a proposal belongs to. */
export type ICallerUnit =
	| { readonly status: 'found'; readonly unit: ILiveProposalUnit }
	| {
			readonly status: 'ambiguous';
			readonly units: readonly ILiveProposalUnit[];
	  }
	| { readonly status: 'none' };

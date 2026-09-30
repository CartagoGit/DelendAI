/** A live unit of work, as a caller's tool call finds it. */
export interface ILiveProposalUnit {
	readonly ref: string;
	readonly path: string;
	readonly agent: string;
	readonly kind: string;
}

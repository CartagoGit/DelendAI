/** What decides which copy of a proposal survives. */
export interface IProposalCopy {
	readonly path: string;
	readonly status: string;
	readonly lastTransitionAt: string;
}

/** Types for `../../proposals/existing-proposal`. */

export interface IExistingProposal {
	readonly id: string;
	/** Path relative to the proposals directory, `/`-separated. */
	readonly file: string;
}

export interface IExistingProposalQuery {
	readonly proposalsDirAbs: string;
	readonly prefix: string;
	readonly slug: string;
	readonly title: string;
	readonly status: string;
}

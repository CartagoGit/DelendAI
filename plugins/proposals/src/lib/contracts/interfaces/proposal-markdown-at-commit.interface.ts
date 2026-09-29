import type { IReconcilerInputFile } from '@delendai/proposals-sqlite';

/** The proposal markdown tree as one commit holds it. */
export interface IProposalMarkdownAtCommit {
	/** The commit the reference resolved to, once, before anything was read. */
	readonly sha: string;
	readonly files: readonly IReconcilerInputFile[];
}

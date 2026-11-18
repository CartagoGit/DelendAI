/**
 * namespace-rename.interface.ts — what `work rename-namespace` reads, writes and reports.
 */

export interface INamespaceRef {
	/** The branch name, without `refs/heads/`. */
	readonly name: string;
	readonly sha: string;
}

/** Everything the rename reads or writes outside the policy. */
export interface INamespaceRenamePorts {
	/** The branches on the forge's remote under any of `prefixes`. */
	readonly heads: (prefixes: readonly string[]) => readonly INamespaceRef[];
	/** The tip of one branch now; undefined when it is gone. */
	readonly tipOf: (name: string) => string | undefined;
	/** The head branches of the open pull requests; undefined when the forge cannot be read. */
	readonly openPullRequestHeads: () => readonly string[] | undefined;
	readonly push: (name: string, sha: string) => boolean;
	readonly verify: (name: string, sha: string) => boolean;
	readonly keep: (retiredRef: string, sha: string) => boolean;
	readonly remove: (name: string) => boolean;
}

export type INamespaceRenameOutcome =
	| 'would-rename'
	| 'renamed'
	| 'skipped-open-pull-request'
	| 'skipped-changed'
	| 'failed';

export interface INamespaceRenamed {
	readonly from: string;
	readonly to: string;
	readonly outcome: INamespaceRenameOutcome;
}

export interface INamespaceRenameReport {
	readonly apply: boolean;
	/** Why nothing was done at all. */
	readonly refused?: string;
	readonly refs: readonly INamespaceRenamed[];
	readonly message: string;
}

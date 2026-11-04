/** One ref `work rename-namespace` moves, at the tip it keeps (f00808 S7). */
export interface INamespaceRenameMove {
	/** Branch name under a former namespace, e.g. `delendai/wip/…`. */
	readonly from: string;
	/** The same name under the current namespace, e.g. `wip/…`. */
	readonly to: string;
	readonly sha: string;
	/** Where the old tip is kept before the old name goes. */
	readonly keptAt: string;
}

/** What renaming would do, or why it does nothing. */
export interface INamespaceRenamePlan {
	readonly refusal?: string;
	readonly moves: readonly INamespaceRenameMove[];
}

/** A branch on the remote, as `ls-remote --heads` lists it. */
export interface IRemoteBranch {
	readonly name: string;
	readonly sha: string;
}

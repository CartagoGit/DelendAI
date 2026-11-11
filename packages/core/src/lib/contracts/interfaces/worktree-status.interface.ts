/** One path `git status --porcelain=v2` lists. */
export interface IWorktreeStatusEntry {
	/** The two status letters, as porcelain v1 writes them (`??` untracked, `!!` ignored). */
	readonly code: string;
	readonly path: string;
	/** The source of a rename or copy. */
	readonly from?: string | undefined;
}

/** The `# branch.*` headers of `git status --branch`. */
export interface IWorktreeBranchStatus {
	readonly oid?: string | undefined;
	readonly head?: string | undefined;
	readonly upstream?: string | undefined;
	readonly ahead?: number | undefined;
	readonly behind?: number | undefined;
}

/** What one `git status --porcelain=v2 --branch` says of a worktree. */
export interface IWorktreeStatus {
	readonly branch: IWorktreeBranchStatus;
	readonly entries: readonly IWorktreeStatusEntry[];
}

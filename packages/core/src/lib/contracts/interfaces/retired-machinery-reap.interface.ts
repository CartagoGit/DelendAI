/** What `work reap` did with one thing the retired queue left in a clone. */
export interface IReapedMachinery {
	/** A local branch (`refs/heads/…`) or a worktree path. */
	readonly what: string;
	readonly outcome: 'removed' | 'would-remove' | 'kept';
	/** Why it was kept: it may hold the only copy of a commit. */
	readonly why?: string;
}

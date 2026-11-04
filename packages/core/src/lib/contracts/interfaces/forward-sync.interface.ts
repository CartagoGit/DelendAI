/** forward-sync.interface.ts — what promotion and follow ask of git and the forge. */

/** What one effect answered. */
export interface IBranchSyncEffect {
	readonly ok: boolean;
	readonly detail: string;
}

/** The effects a promotion or a follow performs, injected so they can be pinned. */
export interface IBranchSyncPorts {
	/** Whether `ancestor` is already in `branch`'s history. */
	readonly isAncestor: (ancestor: string, branch: string) => boolean;
	/** Opens (or finds) the pull request of `head` into `base`. */
	readonly openPullRequest: (base: string, head: string) => IBranchSyncEffect;
	/** Merges `source` into `target` and pushes it. */
	readonly merge: (target: string, source: string) => IBranchSyncEffect;
}

export interface IBranchSyncResult {
	readonly kind: 'promote' | 'follow';
	readonly target: string;
	readonly source: string;
	readonly outcome: 'nothing' | 'pull-request' | 'merged' | 'failed';
	readonly detail: string;
}

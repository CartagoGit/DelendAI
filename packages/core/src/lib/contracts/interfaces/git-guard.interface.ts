/** A git operation a hook asks the development policy about. */
export type IGuardedGitOperation =
	| {
			readonly kind: 'commit';
			/** Short branch name; undefined on a detached HEAD. */
			readonly branch: string | undefined;
			readonly isMerge: boolean;
	  }
	| {
			readonly kind: 'branch-create';
			/** Fully qualified, e.g. `refs/heads/agent/x`. */
			readonly ref: string;
	  }
	| {
			readonly kind: 'push';
			/** Fully qualified remote ref, e.g. `refs/heads/develop`. */
			readonly remoteRef: string;
			readonly deleting: boolean;
	  };

/** Whether the operation may proceed, and why. */
export interface IGitGuardVerdict {
	readonly refused: boolean;
	/** Always present, so an allowed operation can be explained too. */
	readonly reason: string;
	/** What to do instead; present only when refused. */
	readonly remedy?: string;
}

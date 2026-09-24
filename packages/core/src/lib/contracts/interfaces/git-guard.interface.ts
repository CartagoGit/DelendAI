/** A git operation a hook asks the development policy about. */
export type IGuardedGitOperation =
	| {
			readonly kind: 'commit';
			/** Short branch name; undefined on a detached HEAD. */
			readonly branch: string | undefined;
			readonly isMerge: boolean;
			/**
			 * True in the repository's MAIN working tree — the shared
			 * checkout a pinned policy anchors. False in a linked worktree,
			 * where an agent legitimately has a work ref checked out.
			 * Absent means "not observed", and is treated as the main tree:
			 * the stricter reading, because that is the one that protects
			 * the checkout everyone else depends on.
			 */
			readonly inMainWorktree?: boolean | undefined;
	  }
	| {
			readonly kind: 'branch-create';
			/** Fully qualified, e.g. `refs/heads/agent/x`. */
			readonly ref: string;
	  }
	| {
			/**
			 * Something is being written to `refs/stash`: a stash pushed,
			 * whether it is the first or the tenth.
			 */
			readonly kind: 'stash';
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

/**
 * Who is running git. delendai governs agents; a person's use of their
 * own repository is theirs.
 */
export interface IGitGuardActor {
	/**
	 * The agent marker set in the environment of the process running git
	 * (see `AGENT_ENVIRONMENT_MARKERS`), or `undefined` for a person.
	 */
	readonly agentMarker: string | undefined;
}

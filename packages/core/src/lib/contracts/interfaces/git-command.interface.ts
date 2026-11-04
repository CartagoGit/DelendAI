/**
 * git-command.interface.ts — a synchronous git command and its result.
 */
export interface IGitCommandResult {
	readonly ok: boolean;
	/** Trimmed stdout when it succeeded, trimmed stderr when it did not. */
	readonly out: string;
}

export interface IGitCommandOptions {
	/** Variables added on top of the command's environment. */
	readonly env?: NodeJS.ProcessEnv | undefined;
	/**
	 * Drop what a hook told git even in the hook's own worktree: a nested
	 * `git commit` under a merge's `GIT_INDEX_FILE` writes through the
	 * merge's index.
	 */
	readonly hookFree?: boolean | undefined;
	/** Bytes of output allowed; 64 MiB by default. */
	readonly maxBuffer?: number | undefined;
}

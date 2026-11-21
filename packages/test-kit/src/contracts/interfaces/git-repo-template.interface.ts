export interface IGitRepoTemplateSpec {
	/** Files committed on the trunk, by repository path. */
	readonly files?: Readonly<Record<string, string>>;
	/** The trunk branch; git's own default when omitted. */
	readonly trunk?: string;
	/** Worktrees to add, by directory name beside the repository, with the branch each checks out. */
	readonly worktrees?: Readonly<Record<string, string>>;
	/** A bare repository beside the repository, set as `origin` and pushed to. */
	readonly remote?: boolean;
}

export interface IGitRepoCopy {
	/** The repository's working tree. */
	readonly root: string;
	/** Each worktree's directory, by the name it was declared under. */
	readonly worktrees: Readonly<Record<string, string>>;
	/** The bare remote, when the template has one. */
	readonly remote?: string;
	/** Run git in `cwd` (the repository by default). */
	readonly git: (...args: string[]) => string;
}

export interface IGitRepoTemplate {
	readonly copy: () => IGitRepoCopy;
}

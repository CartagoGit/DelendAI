import type { IResolvedDevelopmentPolicy } from '@delendai/core/public';

/** The git hooks `delendai guard` answers for. */
export type IGuardedHook =
	| 'pre-commit'
	| 'commit-msg'
	| 'reference-transaction'
	| 'pre-push'
	| 'post-checkout'
	| 'post-merge';

/** What the guard reads from git and the project; injected by specs. */
export interface IGuardFacts {
	/** Short name of the checked-out branch; undefined when detached. */
	readonly branch: () => string | undefined;
	/** True while a merge is being concluded. */
	readonly isMerge: () => boolean;
	/**
	 * True in the repository's MAIN working tree — the shared checkout a
	 * pinned policy anchors — and false in a linked worktree, where an
	 * agent legitimately has its own work ref checked out.
	 */
	readonly inMainWorktree: () => boolean;
	/** Who the commit is authored as, `Name <email>`; undefined when unknown. */
	readonly author?: () => string | undefined;
	/** The configured identity, without command-line overrides. */
	readonly configuredAuthor?: () => string | undefined;
	/**
	 * The agent the current linked worktree was made for by `work enter`;
	 * undefined in the shared checkout or a worktree delendai did not make.
	 */
	readonly worktreeAgent?: () => string | undefined;
	/**
	 * Whether `sha`, the tip a push deletes from `deletedRef`, is still
	 * reachable from another ref: the integration branch, a publication or
	 * another work ref, not the deleted branch under any of its names.
	 * `undefined` when the commit is not known here.
	 */
	readonly tipKept?: (sha: string, deletedRef: string) => boolean | undefined;
	/** The commit `ref` points at now, if it exists (x00703). */
	readonly refAt?: (ref: string) => string | undefined;
	/** The paths the commit being made changes; undefined when unknown. */
	readonly stagedPaths?: () => readonly string[] | undefined;
	/** The project's documents directory (`docsDir`). */
	readonly docsDir?: (workspace: string) => Promise<string>;
	/** Everything git wrote to the hook's stdin. */
	readonly stdin: () => Promise<string>;
	/**
	 * The policy the project DECLARES, or undefined when its configuration
	 * has no `development` block: an undeclared policy is never enforced.
	 */
	readonly policy: (
		workspace: string,
	) => Promise<IResolvedDevelopmentPolicy | undefined>;
}

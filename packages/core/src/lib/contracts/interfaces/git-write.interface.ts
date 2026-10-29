/**
 * Type contracts moved out of `lib/shared/git-write.ts`.
 *
 * Declared here rather than beside the implementation because
 * `@delendai/core/contracts` re-exports it, and TypeScript type-checks
 * the whole target module to resolve a type — so re-exporting from the
 * implementation dragged its `node:*` imports into every consumer that
 * compiles without `@types/node`, which is the audience the `contracts`
 * subpath exists to serve.
 */
import type { IGitRunner } from './git-runner.interface';
import type { IPushAuthorization } from './force-push-authorization.interface';

export type IPushForceMode = 'with-lease' | 'true' | 'false';

export interface IPushOptions {
	readonly remote?: string;
	readonly branch?: string;
	readonly force?: IPushForceMode;
	/**
	 * Branches this push refuses to force into unless `authorization` is
	 * given — see `gitPush`. Core stays project-agnostic: callers MUST
	 * supply their own resolved list, or pass `[]` explicitly to opt out
	 * of branch protection for this push.
	 */
	readonly protectedBranches: readonly string[];
	/** See `IPushAuthorization`. Required to force-push (either mode) past the guards in `gitPush`. */
	readonly authorization?: IPushAuthorization;
}

export interface ICommitAndPushOptions {
	/** Files to stage. Required and non-empty unless `skipAdd` is set. */
	readonly files?: readonly string[];
	/** Skip `git add` entirely (the caller staged files itself, or amends with no new changes). */
	readonly skipAdd?: boolean;
	readonly message: string;
	readonly amend?: boolean;
	/**
	 * Optional `Name <email>` override passed as `git commit --author=`.
	 * When omitted, the commit uses the active git config. See
	 * `commit-author.ts` for the configurable modes (`git`/`agent`/
	 * `bot`/`named`); `commitAndPush` accepts the already-resolved
	 * value so callers do not have to import the resolver themselves.
	 */
	readonly authorFlag?: string;
	/** When set, also pushes after a successful commit. */
	readonly push?: Omit<IPushOptions, 'protectedBranches'> & {
		readonly protectedBranches?: readonly string[];
	};
	readonly git: IGitRunner;
}

export interface ICommitAndPushResult {
	readonly committed: boolean;
	readonly pushed: boolean;
	readonly hash?: string;
	readonly reason?: string;
}

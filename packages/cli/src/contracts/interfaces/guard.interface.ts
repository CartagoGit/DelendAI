import type { IResolvedDevelopmentPolicy } from '@delendai/core/public';

/** The git hooks `delendai guard` answers for. */
export type IGuardedHook = 'pre-commit' | 'reference-transaction' | 'pre-push';

/** What the guard reads from git and the project; injected by specs. */
export interface IGuardFacts {
	/** Short name of the checked-out branch; undefined when detached. */
	readonly branch: () => string | undefined;
	/** True while a merge is being concluded. */
	readonly isMerge: () => boolean;
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

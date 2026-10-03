/**
 * git-guard-live-unit.ts — a unit's branch is not deleted while a
 * worktree works on it.
 *
 * On 2026-09-28 two units lost their branches with their worktrees still
 * standing, both before their first commit: somebody tidying "empty"
 * branches from a shell. `git branch -D` refuses a branch another worktree
 * has checked out; `git update-ref -d` does not ask. The worktree was left
 * on a branch that no longer existed, its next commit became a root
 * commit, and every file in it read as added.
 *
 * Publishing ends a unit by removing its worktree first, so this never
 * stands in its way. It holds for anyone: the refs are delendai's.
 */
import type { IResolvedDevelopmentPolicy } from '../contracts/interfaces/development-policy.interface';
import type { IGitGuardVerdict } from '../contracts/interfaces/git-guard.interface';
import { shortName } from './git-guard-namespaces';

export const refuseLiveUnitDeletion = (
	policy: IResolvedDevelopmentPolicy,
	operation: { readonly ref: string; readonly worktree?: string | undefined },
): IGitGuardVerdict | undefined => {
	if (operation.worktree === undefined) return undefined;
	if (!operation.ref.startsWith('refs/heads/')) return undefined;
	const branch = operation.ref.slice('refs/heads/'.length);
	const work = shortName(policy.branches.workRefPrefix);
	if (work.length === 0 || !branch.startsWith(work)) return undefined;
	return {
		refused: true,
		reason: `\`${branch}\` is a unit a worktree is working on (${operation.worktree}); deleting its branch leaves that worktree on nothing.`,
		remedy: 'Publish the unit (`delendai work publish`, or the `work` tool), which removes its worktree and then its branch. A unit that is not yours is not yours to remove.',
	};
};

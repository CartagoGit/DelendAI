/**
 * verify-checkout.ts — phase 9: is the visible working tree still where
 * the policy says it must be?
 *
 * Under a `shared-checkout` policy nobody may move HEAD: every agent
 * writes through WIP refs precisely so the one tree the human is looking
 * at stays on the integration branch. If HEAD has been moved — onto a
 * work ref, onto a feature branch, or into a detached state — then the
 * assumptions every other subsystem makes about the tree are false.
 *
 * WHY this is reported and never repaired: the obvious "fix" is
 * `git switch develop` or `git reset --hard`, and both can destroy
 * uncommitted work that exists nowhere else — including the work of
 * whoever moved HEAD in the first place. The git seam this subsystem is
 * given has no checkout and no reset method at all, so the temptation is
 * not merely resisted, it is unavailable.
 */

import type { IResolvedDevelopmentPolicy } from '../../contracts/interfaces/development-policy.interface';
import type { IStartupFinding } from '../contracts';
import { finding } from '../finding-catalog';
import type { IObservedRef, IStartupGitSeam } from '../seams';

/** What phase 9 produced. */
export interface ICheckoutPhaseResult {
	readonly findings: readonly IStartupFinding[];
}

export const runCheckoutPhase = async (input: {
	readonly git: IStartupGitSeam;
	readonly policy: IResolvedDevelopmentPolicy;
	readonly refs: readonly IObservedRef[];
}): Promise<ICheckoutPhaseResult> => {
	const expected = input.policy.branches.integration;
	const branch = await input.git.currentBranch();
	const head = await input.git.headSha();

	if (branch === expected) {
		return {
			findings: [
				finding({
					code: 'checkout.on-integration',
					phase: 'checkout',
					kind: 'note',
					subject: expected,
					message: `HEAD is on the integration branch ${expected}.`,
				}),
			],
		};
	}

	const onWorkRef =
		head === undefined
			? undefined
			: input.refs.find((ref) => ref.sha === head);

	// A worktree-per-agent policy expects other branches to exist; only
	// HEAD sitting on a managed WORK ref is always wrong there, because a
	// work ref is not a branch and must never be a checkout target.
	if (!input.policy.workspace.pinnedCheckout && onWorkRef === undefined) {
		return {
			findings: [
				finding({
					code: 'checkout.on-integration',
					phase: 'checkout',
					kind: 'note',
					subject: branch ?? head ?? 'unknown',
					message: `HEAD is on ${branch ?? 'a detached commit'}; the policy allows per-agent worktrees, so this is not a violation.`,
				}),
			],
		};
	}

	return {
		findings: [
			finding({
				code: 'checkout.head-moved',
				phase: 'checkout',
				kind: 'blocker',
				subject: onWorkRef?.name ?? branch ?? head ?? 'HEAD',
				message:
					onWorkRef === undefined
						? `HEAD is on ${branch ?? `the detached commit ${head ?? 'unknown'}`} instead of the integration branch ${expected}. It was NOT moved back: doing so could discard uncommitted work.`
						: `HEAD has been moved onto the work ref ${onWorkRef.name}, which is not a branch and must never be a checkout target. Nothing was reset.`,
				detail: {
					expected,
					...(branch === undefined ? {} : { branch }),
					...(head === undefined ? {} : { head }),
				},
			}),
		],
	};
};

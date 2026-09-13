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
import type { IObservedRef, IStartupGitSeam } from '../seams.interface';

import type { ICheckoutPhaseResult } from './verify-checkout.interface';

export type { ICheckoutPhaseResult } from './verify-checkout.interface';

/**
 * Being ON the integration branch is not the same as being AT it. A
 * checkout that stayed behind while the branch advanced still looks
 * correct to every other check, and publishing from it reverts whatever
 * landed in between: observed here as a candidate carrying a five-commit-old
 * `validate.ts` that would have removed a rule merged in the meantime.
 *
 * Reported as a NOTE, never a blocker. Falling behind is the normal
 * consequence of somebody else merging, so failing startup on it would
 * make the server unusable; the hard refusal belongs at publication,
 * where the stale content would actually do damage. What this owes the
 * operator is that the condition is never silent.
 *
 * An unresolvable remote ref is reported as its own note rather than
 * treated as "up to date" — absence of evidence is not evidence.
 */
const freshnessFindings = async (
	git: IStartupGitSeam,
	expected: string,
	head: string | undefined,
): Promise<readonly IStartupFinding[]> => {
	const remote = await git.resolveRef(`refs/remotes/origin/${expected}`);
	if (remote === undefined || head === undefined)
		return [
			finding({
				code: 'checkout.freshness-unknown',
				phase: 'checkout',
				kind: 'note',
				subject: expected,
				message: `HEAD is on the integration branch ${expected}, but its remote-tracking ref could not be read, so whether the checkout is current is UNKNOWN.`,
			}),
		];

	if (remote === head)
		return [
			finding({
				code: 'checkout.on-integration',
				phase: 'checkout',
				kind: 'note',
				subject: expected,
				message: `HEAD is on the integration branch ${expected} and level with its remote.`,
			}),
		];

	// Three distinct conditions, three distinct codes. Folding "ahead"
	// into "diverged" would name an unpushed local commit as a conflict
	// and send the operator looking for a reconciliation that does not
	// exist.
	const behind = await git.isAncestor(head, remote);
	const ahead = await git.isAncestor(remote, head);
	const code = behind
		? 'checkout.behind-integration'
		: ahead
			? 'checkout.ahead-of-integration'
			: 'checkout.diverged';
	const message = behind
		? `HEAD is on ${expected} but BEHIND its remote. Publishing from this tree would revert whatever landed in between. Advance it with a fast-forward before publishing.`
		: ahead
			? `HEAD is on ${expected} but AHEAD of its remote: commits exist here that were never pushed. Under a shared checkout nobody should be committing to ${expected} directly.`
			: `HEAD is on ${expected} and has DIVERGED from its remote: each side has commits the other does not.`;

	return [
		finding({
			code,
			phase: 'checkout',
			kind: 'note',
			subject: expected,
			message,
			detail: { expected, head, remote },
		}),
	];
};

export const runCheckoutPhase = async (input: {
	readonly git: IStartupGitSeam;
	readonly policy: IResolvedDevelopmentPolicy;
	readonly refs: readonly IObservedRef[];
}): Promise<ICheckoutPhaseResult> => {
	const expected = input.policy.branches.integration;
	const branch = await input.git.currentBranch();
	const head = await input.git.headSha();

	if (branch === expected) {
		return { findings: await freshnessFindings(input.git, expected, head) };
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

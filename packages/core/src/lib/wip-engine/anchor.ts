/**
 * anchor.ts — is the shared checkout still attached to the branch the
 * whole workspace is built on?
 *
 * WHY this exists, given that the engine already promises never to move
 * HEAD: those are different guarantees, and the gap between them is a
 * real failure that already happened here. An agent ran `git switch` to
 * a feature branch and then used the WIP engine impeccably. The engine
 * kept its contract — it did not move HEAD — while faithfully preserving
 * the WRONG HEAD. Every checkpoint after that was built on a base no
 * other agent shared, and nothing complained, because no component was
 * responsible for the question "which branch should this be?".
 *
 * WHY it reports a verdict instead of throwing: this engine answers with
 * structured results everywhere else, and a refusal an operator can read
 * ("expected develop, found feat/x") is worth more than a stack trace.
 * The caller decides what a wrong anchor costs it.
 *
 * WHY "could not read the branch" is its own verdict rather than a pass:
 * a check that cannot run has not proven anything. Reporting it as
 * anchored would fabricate exactly the guarantee the check exists for.
 *
 * The expected branch is always the policy's `branches.integration`.
 * Nothing here knows the string `develop`, and that is the point: a
 * project integrating on `next` gets the invariant on `next`.
 */

import { gitOutput } from './git-command';
import type { IGitRunner } from '../contracts/interfaces/git-runner.interface';

import type { IAnchorRequirement, TAnchorVerdict } from './anchor.interface';

export type {
	IAnchorRequirement,
	TAnchorVerdict,
} from './anchor.interface';
export { UNANCHORED } from './anchor.constant';

/**
 * Branch HEAD is attached to, `undefined` when HEAD is detached and
 * `null` when git could not answer at all. The three cases are kept
 * apart because they mean three different things to the caller.
 */
const currentBranch = async (
	run: IGitRunner,
): Promise<string | undefined | null> => {
	// `--quiet` makes a detached HEAD an ordinary non-zero exit rather
	// than an error on stderr, so it is distinguishable from a repository
	// that could not be read.
	const inRepo = await gitOutput(run, ['rev-parse', '--is-inside-work-tree']);
	if (inRepo !== 'true') return null;
	const branch = await gitOutput(run, [
		'symbolic-ref',
		'--quiet',
		'--short',
		'HEAD',
	]);
	return branch === undefined || branch === '' ? undefined : branch;
};

/**
 * The requirement a resolved development policy implies. The one place
 * the two policy fields are read together, so no caller has to remember
 * that the branch comes from `branches.integration` and the switch from
 * `workspace.anchoredToIntegrationBranch`.
 */
export const anchorFromPolicy = (policy: {
	readonly branches: { readonly integration: string };
	readonly workspace: { readonly anchoredToIntegrationBranch: boolean };
}): IAnchorRequirement => ({
	required: policy.workspace.anchoredToIntegrationBranch,
	branch: policy.branches.integration,
});

/** Observe the checkout against what the policy requires of it. */
export const observeAnchor = async (
	run: IGitRunner,
	requirement: IAnchorRequirement,
): Promise<TAnchorVerdict> => {
	if (!requirement.required) return { kind: 'not-required' };
	if (requirement.branch === '') {
		return {
			kind: 'unreadable',
			reason: 'the policy anchors the checkout but names no integration branch',
		};
	}

	const branch = await currentBranch(run);
	if (branch === null) {
		return {
			kind: 'unreadable',
			reason: 'git could not report whether this is a working tree',
		};
	}
	if (branch === undefined) return { kind: 'detached' };
	return branch === requirement.branch
		? { kind: 'anchored', branch }
		: {
				kind: 'wrong-branch',
				expected: requirement.branch,
				actual: branch,
			};
};

/**
 * The refusal an operator should see, or `undefined` when the checkout
 * is where it belongs. Every message names the remedy, because "wrong
 * branch" without "and here is what to do" is how an agent invents one.
 */
export const anchorRefusal = (verdict: TAnchorVerdict): string | undefined => {
	if (verdict.kind === 'not-required' || verdict.kind === 'anchored') {
		return undefined;
	}
	if (verdict.kind === 'wrong-branch') {
		return `the shared checkout is on \`${verdict.actual}\` but this workspace is anchored to \`${verdict.expected}\`. Agents own work, not branches: return the checkout to \`${verdict.expected}\` and isolate this work in a wip ref instead of a branch. A ref needed to publish the work for review is created from the checkpoint; it is not a branch to develop on.`;
	}
	if (verdict.kind === 'detached') {
		return 'the shared checkout has a detached HEAD, so the work has no branch to belong to. Reattach it to the integration branch before checkpointing.';
	}
	return `the shared checkout's branch could not be verified (${verdict.reason}), and an unverifiable anchor is not an anchor.`;
};

/**
 * declare-workflow.ts — turns the resolved development policy into the
 * instructions an agent must follow in THIS project.
 *
 * Every sentence is derived from a policy field. Nothing here is a
 * default, a convention or a house style: if the project reconfigures an
 * axis, the declaration changes with it, and a declaration that could
 * not change would be a lie waiting to happen.
 *
 * WHY THIS IS PRINTED AT STARTUP. The work model is the one thing an
 * agent cannot discover safely by looking around. A repository on
 * `shared-checkout-pr` and one on `shared-checkout-merge` look identical
 * on disk, and guessing wrong means committing to the integration branch
 * of a project that forbids it. Declaring it removes the guess.
 */

import { persistenceRouteKind } from './resolve';

import type { IResolvedDevelopmentPolicy } from '../contracts/interfaces/development-policy.interface';
import type {
	IWorkflowDeclaration,
	IWorkflowStep,
} from './declare-workflow.interface';

export type {
	IWorkflowDeclaration,
	IWorkflowStep,
} from './declare-workflow.interface';

/** Where the agent edits, and what it must not do to that checkout. */
const workspaceStep = (policy: IResolvedDevelopmentPolicy): string => {
	if (policy.workspace.strategy === 'agent-worktree')
		return 'Edit in your own worktree; it is yours alone.';
	if (policy.workspace.pinnedCheckout)
		return 'Edit in the shared checkout. It only ever FOLLOWS the integration branch, by fast-forward: never commit to it, switch it, rebase it or reset it, because other agents are editing these same files. Merging is how work lands and is not restricted — the integration engine performs it in a throwaway index, never in this tree, so the tree never learns an integration happened.';
	return 'Edit in the shared checkout.';
};

/** Where a checkpoint goes. `none` is a real answer, not an omission. */
const persistenceStep = (policy: IResolvedDevelopmentPolicy): string => {
	const route = persistenceRouteKind(policy);
	if (route === 'direct-commit')
		return `Commit your work directly to ${policy.branches.integration}.`;
	if (route === 'wip-ref')
		return `Checkpoint your work to ${policy.branches.workRefTemplate}, and never commit to ${policy.branches.integration}.`;
	return 'STOP: this configuration declares no way to persist work. Fix the policy before working.';
};

/** How work reaches the integration branch. */
const integrationStep = (policy: IResolvedDevelopmentPolicy): string => {
	if (policy.integration.requiresPullRequest)
		return `Publish to ${policy.branches.publicationRefPrefix}<name> and open a pull request into ${policy.branches.integration}.`;
	if (policy.integration.strategy === 'merge')
		return `Merge your work ref into ${policy.branches.integration} through the integration engine, never by hand.`;
	return `Your commits reach ${policy.branches.integration} directly; there is no review boundary.`;
};

/** What the integration branch demands before it accepts anything. */
const gateStep = (policy: IResolvedDevelopmentPolicy): string => {
	const checks =
		policy.integration.requiredChecks.length === 0
			? 'no required checks'
			: `checks [${policy.integration.requiredChecks.join(', ')}]`;
	const upToDate = policy.integration.requireLatestIntegration
		? 'and must be up to date with it'
		: 'and need not be refreshed against it';
	return `${policy.branches.integration} requires ${checks} and ${policy.integration.requiredApprovals} approval(s), ${upToDate}.`;
};

/**
 * What the merge does to the branch's commits. Stated in terms of what
 * SURVIVES, because that is the part an operator discovers too late.
 */
const mergeStep = (policy: IResolvedDevelopmentPolicy): string => {
	if (policy.integration.mergeMethod === 'squash')
		return `Work lands squashed: the individual commits of your branch are DISCARDED, and only one commit reaches ${policy.branches.integration}.`;
	if (policy.integration.mergeMethod === 'rebase')
		return `Work lands rebased: your commits are replayed onto ${policy.branches.integration} one by one, with new identities.`;
	return `Work lands as a merge commit, so your commits survive the branch's deletion; \`git log --first-parent ${policy.branches.integration}\` still reads one line per change.`;
};

/** How long the work ref lives, and who ends it. */
const workRefStep = (policy: IResolvedDevelopmentPolicy): string =>
	policy.integration.deleteMergedWorkRef
		? 'The forge deletes your work ref as soon as its pull request merges, so one ref serves exactly one change.'
		: 'Your work ref outlives its pull requests — a proposal lands one pull request per slice — and delendai deletes it when that proposal closes.';

/** The promise the recovery axis makes about work that never landed. */
const recoveryStep = (policy: IResolvedDevelopmentPolicy): string =>
	policy.recovery.neverDiscardUnmergedWork
		? 'Unmerged work is never discarded: startup reconciliation preserves it rather than cleaning it up.'
		: 'Unmerged work may be cleaned up by reconciliation; land it or lose it.';

/**
 * Derives the full declaration. The step list is fixed in LENGTH and
 * ORDER across every policy — a reader comparing two projects compares
 * the same seven positions — while each sentence varies with the axis it
 * came from.
 */
export const declareWorkflow = (
	policy: IResolvedDevelopmentPolicy,
): IWorkflowDeclaration => {
	const sentences: readonly (readonly [string, string])[] = [
		[workspaceStep(policy), 'workspace.strategy'],
		[persistenceStep(policy), 'persistence.strategy'],
		[
			policy.integration.requiresLocalCertification
				? 'Prove the candidate in isolation BEFORE you publish it; a candidate that was not proved must not be published.'
				: 'Certification happens on the forge, not on your machine.',
			'integration.requiresLocalCertification',
		],
		[integrationStep(policy), 'integration.strategy'],
		[gateStep(policy), 'integration.requiredChecks'],
		[mergeStep(policy), 'integration.mergeMethod'],
		[workRefStep(policy), 'integration.deleteMergedWorkRef'],
		[recoveryStep(policy), 'recovery.neverDiscardUnmergedWork'],
	];

	const steps: readonly IWorkflowStep[] = sentences.map(
		([instruction, derivedFrom], index): IWorkflowStep => ({
			order: index + 1,
			instruction,
			derivedFrom,
		}),
	);

	return {
		profile: policy.profile,
		integrationBranch: policy.branches.integration,
		releaseBranch: policy.branches.release,
		steps,
	};
};

/** Renders the declaration as the stderr block printed before going live. */
export const renderWorkflowDeclaration = (
	declaration: IWorkflowDeclaration,
): string =>
	[
		`[delendai] work model: ${declaration.profile} (integration=${declaration.integrationBranch}, release=${declaration.releaseBranch})`,
		...declaration.steps.map(
			(step) => `[delendai]   ${step.order}. ${step.instruction}`,
		),
	].join('\n');

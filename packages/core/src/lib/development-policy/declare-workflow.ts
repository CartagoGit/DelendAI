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

import { shortName } from './git-guard-namespaces';
import { persistenceRouteKind } from './resolve';

import type { IResolvedDevelopmentPolicy } from '../contracts/interfaces/development-policy.interface';
import type {
	ILandRoute,
	IStartRoute,
	IWorkflowDeclaration,
	IWorkflowStep,
	IWorkModelBrief,
} from './declare-workflow.interface';

export type {
	IWorkflowDeclaration,
	IWorkflowStep,
	IWorkModelBrief,
} from './declare-workflow.interface';

/** Where the agent edits, and what it must not do to that checkout. */
const workspaceStep = (policy: IResolvedDevelopmentPolicy): string => {
	if (policy.workspace.strategy === 'agent-worktree')
		return 'Edit in your own worktree; it is yours alone.';
	if (
		policy.workspace.pinnedCheckout &&
		policy.persistence.allowsDirectIntegrationCommit
	)
		return `Edit in the shared checkout on ${policy.branches.integration}. Never switch it, rebase it or reset it: other agents are editing these same files.`;
	if (policy.workspace.pinnedCheckout)
		return `The shared checkout only ever FOLLOWS ${policy.branches.integration}, by fast-forward: never commit to it, switch it, rebase it or reset it, because other agents are editing these same files. Merging is how work lands and is not restricted — the integration engine performs it in a throwaway index, never in this tree, so the tree never learns an integration happened.`;
	return 'Edit in the shared checkout.';
};

/** How a unit of work starts, from the persistence axis. */
const startRouteOf = (policy: IResolvedDevelopmentPolicy): IStartRoute =>
	policy.persistence.strategy === 'branch'
		? 'branch'
		: persistenceRouteKind(policy);

/** How finished work lands, from the integration axis. */
const landRouteOf = (policy: IResolvedDevelopmentPolicy): ILandRoute => {
	if (policy.integration.requiresPullRequest) return 'pull-request';
	return policy.integration.strategy === 'merge' ? 'merge' : 'direct';
};

/**
 * How a unit of work starts and where its commits go. `none` is a real
 * answer, not an omission.
 */
const START_STEPS: Readonly<
	Record<IStartRoute, (policy: IResolvedDevelopmentPolicy) => string>
> = {
	branch: (policy) =>
		`Commit on your worktree's own branch (${shortName(policy.branches.workRefTemplate)}), never on ${policy.branches.integration}.`,
	'wip-ref': (policy) =>
		`Start each unit of work with \`delendai work enter --proposal=<id> --slice=<slice> --agent=<you>\` (or the \`work\` tool, action enter) and edit and commit in the worktree it prints, passing it as \`checkout\` to delendai's tools; from the shared checkout, \`delendai work checkpoint --proposal=<id> --slice=<slice> --paths=<a,b> --message=<text>\` writes the same ref without moving HEAD. Your work ref is ${shortName(policy.branches.workRefTemplate)}; never commit to ${policy.branches.integration}.`,
	'direct-commit': (policy) =>
		`Commit your work directly to ${policy.branches.integration}; there is no unit of work to enter.`,
	none: () =>
		'STOP: this configuration declares no way to persist work. Fix the policy before working.',
};

/** How work reaches the integration branch. */
const LAND_STEPS: Readonly<
	Record<ILandRoute, (policy: IResolvedDevelopmentPolicy) => string>
> = {
	'pull-request': ({ branches }) =>
		`Land finished work through a pull request: \`delendai work publish\` (or the \`work\` tool, action publish) pushes ${shortName(branches.publicationRefPrefix)}<name> and opens a pull request into ${branches.integration}. Never push to ${branches.integration} directly.`,
	merge: ({ branches }) =>
		`Land finished work by MERGING it into ${branches.integration}; this profile opens no pull request. Finish the unit with \`delendai work publish\`: the merge is delendai's integration engine, never a hand-made merge, and it takes only a candidate the local validation gate passed against the current ${branches.integration} head.`,
	direct: ({ branches }) =>
		`Your commits reach ${branches.integration} directly; there is no review boundary and no pull request.`,
};

/** The same two answers, in the fewest words a budgeted payload allows. */
const START_SUMMARIES: Readonly<
	Record<IStartRoute, (integration: string) => string>
> = {
	branch: () => 'commit on your worktree branch',
	'wip-ref': () => 'start with `delendai work enter`',
	'direct-commit': (integration) => `commit on ${integration}`,
	none: () => 'no way to persist work: fix the policy',
};

const LAND_SUMMARIES: Readonly<
	Record<ILandRoute, (integration: string) => string>
> = {
	'pull-request': (integration) => `land by pull request into ${integration}`,
	merge: (integration) =>
		`land by merge into ${integration} after the local gate, no pull request`,
	direct: (integration) => `commits land on ${integration} directly`,
};

const persistenceStep = (policy: IResolvedDevelopmentPolicy): string =>
	START_STEPS[startRouteOf(policy)](policy);

const integrationStep = (policy: IResolvedDevelopmentPolicy): string =>
	LAND_STEPS[landRouteOf(policy)](policy);

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

/**
 * The two sentences an agent needs at the moment it is stopped: how work
 * starts and how it lands, in this profile. A refusal that says only
 * "not here" leaves the agent to guess the route, and it guesses the one
 * it read somewhere else.
 */
export const briefWorkModel = (
	policy: IResolvedDevelopmentPolicy,
): IWorkModelBrief => ({
	profile: policy.profile,
	integrationBranch: policy.branches.integration,
	start: persistenceStep(policy),
	land: integrationStep(policy),
});

/** The brief as one remedy sentence, naming the profile it comes from. */
export const workModelNextStep = (
	policy: IResolvedDevelopmentPolicy,
): string => {
	const brief = briefWorkModel(policy);
	return `Under the \`${brief.profile}\` profile: ${brief.start} ${brief.land}`;
};

/**
 * The work model in one line, for a payload with a token budget (the
 * compact overview). Same axes as the declaration, fewer words; the full
 * declaration is in the server instructions and the bootstrap prompt.
 */
export const workModelSummary = (
	policy: IResolvedDevelopmentPolicy,
): string => {
	const integration = policy.branches.integration;
	const start = START_SUMMARIES[startRouteOf(policy)](integration);
	const land = LAND_SUMMARIES[landRouteOf(policy)](integration);
	return `${policy.profile}: ${start}; ${land}.`;
};

/**
 * The declaration as the lines a host puts in its model's instructions
 * when it connects, and the bootstrap prompt repeats. Headed by where the
 * model comes from, because an agent that has read a document describing
 * another workflow must know which of the two wins.
 */
export const workModelInstructionLines = (
	policy: IResolvedDevelopmentPolicy,
): readonly string[] => {
	const declaration = declareWorkflow(policy);
	return [
		`Work model: \`${declaration.profile}\` (integration branch ${declaration.integrationBranch}, release branch ${declaration.releaseBranch}), resolved from this project's configuration. It overrides any document that describes another workflow:`,
		...declaration.steps.map(
			(step) => `${step.order}. ${step.instruction}`,
		),
	];
};

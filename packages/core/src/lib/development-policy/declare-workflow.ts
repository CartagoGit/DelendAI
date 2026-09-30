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

/**
 * The command that lands a unit under the merge profile. Named once, so
 * what an agent is told and what `work publish` runs cannot drift apart.
 */
const LAND_BY_MERGE_COMMAND =
	'delendai work publish --proposal=<id> --slice=<slice> --agent=<you>';

/** How work reaches the integration branch. */
const LAND_STEPS: Readonly<
	Record<ILandRoute, (policy: IResolvedDevelopmentPolicy) => string>
> = {
	'pull-request': ({ branches }) =>
		`Land finished work through a pull request: \`delendai work publish\` (or the \`work\` tool, action publish) pushes ${shortName(branches.publicationRefPrefix)}<name> and opens a pull request into ${branches.integration}. Never push to ${branches.integration} directly.`,
	merge: ({ branches }) =>
		`Land finished work by MERGING it into ${branches.integration}; this profile opens no pull request. Finish the unit with \`${LAND_BY_MERGE_COMMAND}\` (or the \`work\` tool, action publish): it merges your work ref into the current ${branches.integration} head in a throwaway index, runs the validation gate ${branches.integration} declares on that merge, and pushes it only if the gate passed — refusing, with the next step, when the gate fails, the head moved or the merge conflicts. Never merge or push to ${branches.integration} by hand.`,
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
		`land by merge into ${integration} with \`delendai work publish\`, after the local gate, no pull request`,
	direct: (integration) => `commits land on ${integration} directly`,
};

const persistenceStep = (policy: IResolvedDevelopmentPolicy): string =>
	START_STEPS[startRouteOf(policy)](policy);

const integrationStep = (policy: IResolvedDevelopmentPolicy): string =>
	LAND_STEPS[landRouteOf(policy)](policy);

/**
 * Each of the next five steps answers one question, and the answer
 * depends on HOW work lands: a sentence about the forge is a lie under a
 * profile that has none. So every step is a table keyed by the landing
 * route, and no route inherits another's wording.
 */
type ILandingSentences = Readonly<
	Record<ILandRoute, (policy: IResolvedDevelopmentPolicy) => string>
>;

/** Who certifies a candidate, and when. */
const CERTIFICATION_STEPS: ILandingSentences = {
	'pull-request': (policy) =>
		policy.integration.requiresLocalCertification
			? 'Prove the candidate in isolation BEFORE you publish it; a candidate that was not proved must not be published.'
			: 'Certification happens on the forge, not on your machine.',
	merge: ({ branches }) =>
		`Nothing lands uncertified: \`delendai work publish\` runs the validation gate ${branches.integration} declares (\`validationMatrix.scopes\` in delendai.config.json, else a \`validate\` script) on the merge it would push, in a worktree of its own, and a project that declares no gate lands nothing.`,
	direct: ({ branches }) =>
		`Nothing certifies your commits before they reach ${branches.integration}: run the project's checks yourself first.`,
};

/** What the integration branch demands before it accepts anything. */
const GATE_STEPS: ILandingSentences = {
	'pull-request': ({ branches, integration }) => {
		const checks =
			integration.requiredChecks.length === 0
				? 'no required checks'
				: `checks [${integration.requiredChecks.join(', ')}]`;
		const upToDate = integration.requireLatestIntegration
			? 'and must be up to date with it'
			: 'and need not be refreshed against it';
		return `${branches.integration} requires ${checks} and ${integration.requiredApprovals} approval(s), ${upToDate}.`;
	},
	merge: ({ branches, integration }) =>
		integration.requireLatestIntegration
			? `The local validation gate is the only check ${branches.integration} gets, and it always judges the merge against the current ${branches.integration} head.`
			: `The local validation gate is the only check ${branches.integration} gets; a candidate built on an older head is not validated again.`,
	direct: ({ branches }) =>
		`${branches.integration} enforces no checks and no approvals; nothing gates a commit.`,
};

const mergeCommitSentence = (integration: string): string =>
	`Work lands as a merge commit, so your commits survive the branch's deletion; \`git log --first-parent ${integration}\` still reads one line per change.`;

/**
 * What landing does to the branch's commits. Stated in terms of what
 * SURVIVES, because that is the part an operator discovers too late.
 */
const MERGE_STEPS: ILandingSentences = {
	'pull-request': ({ branches, integration }) => {
		if (integration.mergeMethod === 'squash')
			return `Work lands squashed: the individual commits of your branch are DISCARDED, and only one commit reaches ${branches.integration}.`;
		if (integration.mergeMethod === 'rebase')
			return `Work lands rebased: your commits are replayed onto ${branches.integration} one by one, with new identities.`;
		return mergeCommitSentence(branches.integration);
	},
	merge: ({ branches }) => mergeCommitSentence(branches.integration),
	direct: ({ branches }) =>
		`Each commit reaches ${branches.integration} exactly as you made it; nothing is combined or rewritten.`,
};

/** How long the work ref lives, and who ends it. */
const WORK_REF_STEPS: ILandingSentences = {
	'pull-request': ({ integration }) =>
		integration.deleteMergedWorkRef
			? 'The forge deletes your work ref as soon as its pull request merges, so one ref serves exactly one change.'
			: 'Your work ref outlives its pull requests — a proposal lands one pull request per slice — and delendai deletes it when that proposal closes.',
	merge: () =>
		'Publishing ends your work ref once its work has landed, unless its proposal still has slices to commit on it.',
	direct: () => 'There is no work ref in this profile.',
};

const landingStep = (
	steps: ILandingSentences,
	policy: IResolvedDevelopmentPolicy,
): string => steps[landRouteOf(policy)](policy);

/** The promise the recovery axis makes about work that never landed. */
const recoveryStep = (policy: IResolvedDevelopmentPolicy): string => {
	if (policy.recovery.strategy === 'none')
		return 'Startup reconciles nothing and resumes nothing: commit whatever you want to keep.';
	return policy.recovery.neverDiscardUnmergedWork
		? 'Unmerged work is never discarded: startup reconciliation preserves it rather than cleaning it up.'
		: 'Unmerged work may be cleaned up by reconciliation; land it or lose it.';
};

/**
 * Derives the full declaration. The step list is fixed in LENGTH and
 * ORDER across every policy — a reader comparing two projects compares
 * the same eight positions — while each sentence varies with the axis it
 * came from.
 */
export const declareWorkflow = (
	policy: IResolvedDevelopmentPolicy,
): IWorkflowDeclaration => {
	const sentences: readonly (readonly [string, string])[] = [
		[workspaceStep(policy), 'workspace.strategy'],
		[persistenceStep(policy), 'persistence.strategy'],
		[
			landingStep(CERTIFICATION_STEPS, policy),
			'integration.requiresLocalCertification',
		],
		[integrationStep(policy), 'integration.strategy'],
		[landingStep(GATE_STEPS, policy), 'integration.requiredChecks'],
		[landingStep(MERGE_STEPS, policy), 'integration.mergeMethod'],
		[
			landingStep(WORK_REF_STEPS, policy),
			'integration.deleteMergedWorkRef',
		],
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

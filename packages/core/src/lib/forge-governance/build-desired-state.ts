/**
 * build-desired-state.ts — derives the desired forge configuration PURELY
 * from the resolved development policy.
 *
 * This is the file that makes forge governance honest. Nothing here reads
 * a repository name, a forge default branch, an environment variable or a
 * previously-observed live setting: a project states its model once in
 * `IResolvedDevelopmentPolicy` and the branch protection it should have
 * falls out of that. Two projects with the same policy get the same
 * desired state; one project that changes its policy gets a different one
 * without anybody editing this file.
 *
 * The number of human approvals a branch requires is NOT hardcoded here.
 * It is a policy decision — a project whose agents integrate autonomously
 * on green CI requires none — so it defaults to zero and is overridden
 * through `IBuildDesiredStateOptions` until `IResolvedDevelopmentPolicy`
 * carries the field itself. The release branch stays strictly stronger
 * than the integration branch on the other axes regardless, so the
 * invariant never depends on the approval count.
 *
 * The two integration strategies produce genuinely different shapes.
 * `pull-request` asks the forge to be the gate. `direct` deliberately
 * does NOT: a project that chose direct integration pushes to its
 * integration branch, so demanding a pull request there would break the
 * runtime it just configured. What both share is the release branch,
 * which is always held to a strictly stronger shape than integration.
 */

import type {
	IPolicyIntegration,
	IResolvedDevelopmentPolicy,
} from '../contracts/interfaces/development-policy.interface';
import {
	branchPropertyId,
	type IDesiredApprovals,
	type IDesiredBranchRule,
	type IDesiredForgeState,
	type IDesiredRepositorySettings,
} from './governance-contracts';

import type { IBuildDesiredStateOptions } from './build-desired-state.interface';

export type { IBuildDesiredStateOptions } from './build-desired-state.interface';

/**
 * Approval counts, defaulted to zero and normalised.
 *
 * Autonomous integration is the model this project migrates to, so zero
 * is the default rather than a special case. Release is never allowed to
 * sit BELOW integration: a release branch that asked for fewer approvals
 * than the branch feeding it would break the strictness invariant, and
 * silently accepting that would be worse than clamping it.
 */
const resolveApprovals = (
	requested: IBuildDesiredStateOptions['approvals'],
): IDesiredApprovals => {
	const integration = Math.max(0, Math.trunc(requested?.integration ?? 0));
	const release = Math.max(integration, Math.trunc(requested?.release ?? 0));
	return { integration, release };
};

/** Deduplicated, order-preserving check contexts. */
const uniqueChecks = (checks: readonly string[]): readonly string[] => [
	...new Set(checks.map((check) => check.trim()).filter((c) => c.length > 0)),
];

/**
 * The integration branch under `pull-request`: the forge is the gate, so
 * the policy's checks become required contexts and `requireLatestIntegration`
 * becomes the forge's strict/up-to-date gate — the thing that stops two
 * independently-green candidates from combining into a red branch.
 */
const pullRequestIntegrationRule = (
	branch: string,
	integration: IPolicyIntegration,
	checks: readonly string[],
	requiredApprovingReviews: number,
): IDesiredBranchRule => ({
	branch,
	role: 'integration',
	requirePullRequest: true,
	requiredApprovingReviews,
	requiredChecks: checks,
	requireChecksUpToDate: integration.requireLatestIntegration,
	requireLinearHistory: integration.linearHistory,
	allowForcePush: integration.allowForcePush,
	allowDeletion: integration.allowDeleteIntegrationBranch,
	requireConversationResolution: false,
	enforceAdmins: false,
});

/**
 * The integration branch under `direct`: a compatible shape, NOT the
 * pull-request one with fields blanked out. The branch must still exist,
 * still refuse force-pushes and deletion per policy and still keep the
 * history shape the policy asked for — but it must remain pushable, so no
 * pull request and no required contexts are imposed.
 */
const directIntegrationRule = (
	branch: string,
	integration: IPolicyIntegration,
): IDesiredBranchRule => ({
	branch,
	role: 'integration',
	requirePullRequest: false,
	requiredApprovingReviews: 0,
	requiredChecks: [],
	requireChecksUpToDate: false,
	requireLinearHistory: integration.linearHistory,
	allowForcePush: integration.allowForcePush,
	allowDeletion: integration.allowDeleteIntegrationBranch,
	requireConversationResolution: false,
	enforceAdmins: false,
});

/**
 * The release branch. Strictly stronger than integration under BOTH
 * strategies, and deliberately NOT by way of the approval count: a
 * release always arrives by pull request, always requires up-to-date
 * checks, always requires conversations to be resolved, always forbids
 * force-push and deletion, and always binds admins too. That holds with
 * zero approvals on both branches, which is what lets an autonomous
 * project be governed at all. See `strictness.ts` for the comparator the
 * tests hold this to.
 */
const releaseRule = (
	branch: string,
	checks: readonly string[],
	requiredApprovingReviews: number,
): IDesiredBranchRule => ({
	branch,
	role: 'release',
	requirePullRequest: true,
	requiredApprovingReviews,
	requiredChecks: checks,
	requireChecksUpToDate: true,
	requireLinearHistory: true,
	allowForcePush: false,
	allowDeletion: false,
	requireConversationResolution: true,
	enforceAdmins: true,
});

/** Only the policy's chosen merge method stays enabled on the repository. */
const repositorySettings = (
	integration: IPolicyIntegration,
): IDesiredRepositorySettings => ({
	mergeMethod: integration.mergeMethod,
	allowSquashMerge: integration.mergeMethod === 'squash',
	allowMergeCommit: integration.mergeMethod === 'merge',
	allowRebaseMerge: integration.mergeMethod === 'rebase',
	deleteBranchOnMerge: integration.deleteMergedWorkRef,
});

/**
 * Properties this policy deliberately leaves to the forge. This is the
 * ONLY sanctioned exclusion from the verdict: a property that is merely
 * unreadable is `NOT_EXECUTABLE`, never "not applicable".
 */
const notApplicableProperties = (
	rules: readonly IDesiredBranchRule[],
): readonly string[] => {
	const ids: string[] = [];
	for (const rule of rules) {
		if (rule.requiredChecks.length === 0) {
			// "Empty means the forge decides" (IPolicyIntegration).
			ids.push(branchPropertyId(rule.branch, 'requiredChecks'));
			ids.push(branchPropertyId(rule.branch, 'requireChecksUpToDate'));
		}
		if (!rule.requirePullRequest) {
			// A review count is meaningless without a pull request.
			ids.push(branchPropertyId(rule.branch, 'requiredApprovingReviews'));
		}
	}
	return ids;
};

/**
 * Derive the desired forge state. Pure: same policy and options in, same
 * state out.
 */
export const buildDesiredState = (
	policy: IResolvedDevelopmentPolicy,
	options: IBuildDesiredStateOptions = {},
): IDesiredForgeState => {
	const { integration, branches, governance } = policy;
	const checks = uniqueChecks(integration.requiredChecks);
	const approvals = resolveApprovals(options.approvals);
	const integrationRule =
		integration.strategy === 'pull-request'
			? pullRequestIntegrationRule(
					branches.integration,
					integration,
					checks,
					approvals.integration,
				)
			: directIntegrationRule(branches.integration, integration);
	const release = releaseRule(branches.release, checks, approvals.release);
	const rules: readonly IDesiredBranchRule[] =
		branches.release === branches.integration
			? [integrationRule]
			: [integrationRule, release];

	return {
		policyProfile: policy.profile,
		integrationStrategy: integration.strategy,
		enforced: governance.enforced,
		failClosedOnUnverifiable: governance.failClosedOnUnverifiable,
		repository: repositorySettings(integration),
		approvals,
		branches: rules,
		notApplicable: notApplicableProperties(rules),
	};
};

/** Look a derived branch rule up by name. Undefined when not governed. */
export const findBranchRule = (
	desired: IDesiredForgeState,
	branch: string,
): IDesiredBranchRule | undefined =>
	desired.branches.find((rule) => rule.branch === branch);

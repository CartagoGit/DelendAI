/**
 * validate.ts — rejects policy combinations that cannot be honoured.
 *
 * Not every combination of orthogonal axes is meaningful. A shared
 * working tree with no claims is a data race; a wip-ref model that
 * integrates directly has nowhere for its certification to happen. The
 * spec is explicit that such a policy must fail startup with a concrete
 * diagnostic rather than have the runtime improvise, so every rule here
 * carries the remedy alongside the complaint.
 *
 * Unknown strategy strings land here too: `resolve.ts` deliberately does
 * not throw on them, so that a typo is reported as "you wrote X, valid
 * values are Y" instead of a stack trace from deep inside a merge.
 */

import {
	CHECKPOINT_STRATEGIES,
	COORDINATION_STRATEGIES,
	GOVERNANCE_STRATEGIES,
	INTEGRATION_STRATEGIES,
	MERGE_METHODS,
	PERSISTENCE_STRATEGIES,
	RECOVERY_STRATEGIES,
	WORKSPACE_STRATEGIES,
	type IDevelopmentPolicyViolation,
	type IResolvedDevelopmentPolicy,
} from '../contracts/interfaces/development-policy.interface';
import { DEVELOPMENT_PROFILES } from './profiles';

const oneOf = (
	path: string,
	value: string,
	allowed: readonly string[],
	out: IDevelopmentPolicyViolation[],
): void => {
	if (allowed.includes(value)) return;
	out.push({
		rule: 'unknown-strategy',
		path,
		message: `\`${value}\` is not a recognised value for ${path}.`,
		remedy: `Use one of: ${allowed.join(', ')}.`,
	});
};

/** Vocabulary checks — every axis value must be a value we implement. */
const validateVocabulary = (
	policy: IResolvedDevelopmentPolicy,
	out: IDevelopmentPolicyViolation[],
): void => {
	oneOf('workspace.strategy', policy.workspace.strategy, WORKSPACE_STRATEGIES, out);
	oneOf('persistence.strategy', policy.persistence.strategy, PERSISTENCE_STRATEGIES, out);
	oneOf('checkpoint.strategy', policy.checkpoint.strategy, CHECKPOINT_STRATEGIES, out);
	oneOf('integration.strategy', policy.integration.strategy, INTEGRATION_STRATEGIES, out);
	oneOf('coordination.strategy', policy.coordination.strategy, COORDINATION_STRATEGIES, out);
	oneOf('recovery.strategy', policy.recovery.strategy, RECOVERY_STRATEGIES, out);
	oneOf('governance.strategy', policy.governance.strategy, GOVERNANCE_STRATEGIES, out);
	oneOf('integration.mergeMethod', policy.integration.mergeMethod, MERGE_METHODS, out);

	if (
		policy.profile !== 'custom' &&
		!(DEVELOPMENT_PROFILES as readonly string[]).includes(policy.profile)
	) {
		out.push({
			rule: 'unknown-profile',
			path: 'development.profile',
			message: `\`${policy.profile}\` is not a known profile.`,
			remedy: `Use one of: ${DEVELOPMENT_PROFILES.join(', ')} — or omit \`profile\` and write the axes directly.`,
		});
	}
};

/** Branch identities must be usable and distinct. */
const validateBranches = (
	policy: IResolvedDevelopmentPolicy,
	out: IDevelopmentPolicyViolation[],
): void => {
	const { integration, release, workRefTemplate } = policy.branches;

	if (integration.length === 0) {
		out.push({
			rule: 'integration-branch-required',
			path: 'branches.integration',
			message: 'No integration branch is configured.',
			remedy: 'Set `development.branches.integration` (e.g. "develop"). Do not rely on the forge default branch.',
		});
	}

	if (integration.length > 0 && integration === release) {
		out.push({
			rule: 'release-must-differ',
			path: 'branches.release',
			message: `The integration and release branches are both \`${integration}\`.`,
			remedy: 'Give the release branch its own name so it can carry a stricter policy than the branch agents integrate into.',
		});
	}

	if (policy.persistence.usesWipRefs) {
		if (workRefTemplate.length === 0) {
			out.push({
				rule: 'work-ref-template-required',
				path: 'branches.workRefTemplate',
				message: 'The wip-ref persistence strategy needs a template to name each unit of work.',
				remedy: 'Set `development.branches.workRefTemplate`, e.g. "wip/${agent}/${proposal}-${slice}-g${generation}".',
			});
		} else if (!workRefTemplate.includes('${generation}')) {
			out.push({
				rule: 'work-ref-template-needs-generation',
				path: 'branches.workRefTemplate',
				message: 'The work-ref template has no `${generation}` placeholder, so successive checkpoints of one slice would collide on the same ref.',
				remedy: 'Add `${generation}` to the template — a slice integrates as several generations, not as one long-lived branch.',
			});
		}
	}
};

/** Cross-axis coherence — the combinations that cannot be honoured. */
const validateCombinations = (
	policy: IResolvedDevelopmentPolicy,
	out: IDevelopmentPolicyViolation[],
): void => {
	if (policy.workspace.shared && !policy.coordination.requiresClaims) {
		out.push({
			rule: 'shared-tree-needs-claims',
			path: 'coordination.strategy',
			message: 'Several agents share one working tree with no coordination, so two of them can write the same file at once.',
			remedy: 'Set `development.coordination.strategy` to "file-locks" or "sqlite-leases", or move to the "agent-worktree" workspace strategy.',
		});
	}

	if (policy.persistence.usesWipRefs && !policy.integration.requiresPullRequest) {
		out.push({
			rule: 'wip-ref-needs-pull-request',
			path: 'integration.strategy',
			message: 'Work is persisted to wip refs, but integration is direct — there is nowhere for a checkpoint to be certified before it lands.',
			remedy: 'Set `development.integration.strategy` to "pull-request", or persist with "direct-commit".',
		});
	}

	if (policy.workspace.agentWorktrees && policy.persistence.strategy === 'direct-commit') {
		out.push({
			rule: 'worktree-needs-own-ref',
			path: 'persistence.strategy',
			message: 'Each agent has its own worktree, but work is committed straight onto the integration branch, which defeats the isolation.',
			remedy: 'Set `development.persistence.strategy` to "branch".',
		});
	}

	if (policy.recovery.resumeExistingWork && policy.persistence.strategy === 'direct-commit') {
		out.push({
			rule: 'recovery-needs-durable-ref',
			path: 'recovery.strategy',
			message: 'Abandoned work cannot be resumed when it was committed directly to the integration branch — there is no separate ref to recover.',
			remedy: 'Use the "wip-ref" or "branch" persistence strategy, or set `development.recovery.strategy` to "none".',
		});
	}

	if (policy.integration.strategy === 'direct' && policy.integration.requireLatestIntegration) {
		out.push({
			rule: 'direct-cannot-require-latest',
			path: 'integration.requireLatestIntegration',
			message: 'Re-validation against the latest integration head is meaningless without a pull request to hold the candidate.',
			remedy: 'Either switch to "pull-request" integration or set `requireLatestIntegration` to false.',
		});
	}

	if (policy.integration.mergeGreenProgressContinuously && !policy.integration.requiresPullRequest) {
		out.push({
			rule: 'green-progress-needs-pull-request',
			path: 'integration.mergeGreenProgressContinuously',
			message: 'Continuous integration of green checkpoints needs a pull request to establish that a checkpoint is green.',
			remedy: 'Switch to "pull-request" integration, or turn `mergeGreenProgressContinuously` off.',
		});
	}

	if (
		policy.governance.enforced &&
		policy.integration.requiresPullRequest &&
		policy.integration.requiredChecks.length === 0
	) {
		out.push({
			rule: 'enforced-governance-needs-checks',
			path: 'integration.requiredChecks',
			message: 'Governance is enforced and a pull request is required, but no check is required — the gate would pass anything.',
			remedy: 'List at least one required check context in `development.integration.requiredChecks`.',
		});
	}

	if (policy.checkpoint.strategy !== 'slice' && policy.checkpoint.intervalMinutes <= 0) {
		out.push({
			rule: 'interval-needs-minutes',
			path: 'checkpoint.intervalMinutes',
			message: `The "${policy.checkpoint.strategy}" checkpoint strategy is driven by an interval, but the interval is ${policy.checkpoint.intervalMinutes}.`,
			remedy: 'Set a positive `development.checkpoint.intervalMinutes`, or use the "slice" strategy.',
		});
	}

	if (
		policy.integration.requiredApprovals < 0 ||
		!Number.isInteger(policy.integration.requiredApprovals) ||
		policy.integration.releaseRequiredApprovals < 0 ||
		!Number.isInteger(policy.integration.releaseRequiredApprovals)
	) {
		out.push({
			rule: 'approvals-must-be-whole',
			path: 'integration.requiredApprovals',
			message: 'An approval count must be a whole number of people, and cannot be negative.',
			remedy: 'Use 0 for autonomous integration, or a positive whole number to require human review.',
		});
	}

	if (
		policy.integration.releaseRequiredApprovals <
		policy.integration.requiredApprovals
	) {
		out.push({
			rule: 'release-approvals-not-weaker',
			path: 'integration.releaseRequiredApprovals',
			message: `The release branch asks for ${policy.integration.releaseRequiredApprovals} approvals while the integration branch asks for ${policy.integration.requiredApprovals}, which makes releasing easier than integrating.`,
			remedy: 'Raise `releaseRequiredApprovals` to at least `requiredApprovals` — release is the stricter boundary.',
		});
	}

	if (policy.coordination.requiresClaims && policy.coordination.leaseTtlMinutes <= 0) {
		out.push({
			rule: 'claims-need-lease-ttl',
			path: 'coordination.leaseTtlMinutes',
			message: 'Claims are required but leases never expire, so work abandoned by a dead agent would block its paths forever.',
			remedy: 'Set a positive `development.coordination.leaseTtlMinutes`.',
		});
	}
};

/**
 * Returns every violation, most structural first. An empty array means
 * the policy is coherent and the runtime may start against it.
 */
export const validateDevelopmentPolicy = (
	policy: IResolvedDevelopmentPolicy,
): readonly IDevelopmentPolicyViolation[] => {
	const violations: IDevelopmentPolicyViolation[] = [];
	validateVocabulary(policy, violations);
	// Vocabulary errors make the cross-axis rules meaningless — a typo'd
	// strategy would produce a cascade of confusing follow-on complaints,
	// so the operator is asked to fix the spelling first.
	if (violations.length > 0) return violations;
	validateBranches(policy, violations);
	validateCombinations(policy, violations);
	return violations;
};

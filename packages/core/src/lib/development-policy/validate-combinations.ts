/**
 * validate-combinations.ts — the cross-axis coherence rules.
 *
 * Split out of `validate.ts` so that file keeps one job (orchestrating a
 * validation and checking vocabulary) and this one keeps the other: the
 * catalogue of combinations that cannot be honoured. The catalogue only
 * grows — every accident this project has lived through arrives here as
 * a rule — so it is the half that needed its own file.
 *
 * Every rule states the remedy next to the complaint. A policy violation
 * that only says "invalid" leaves the operator to guess which of seven
 * axes to move.
 */

import type {
	IDevelopmentPolicyViolation,
	IResolvedDevelopmentPolicy,
} from '../contracts/interfaces/development-policy.interface';

/** Cross-axis coherence — the combinations that cannot be honoured. */
export const validateCombinations = (
	policy: IResolvedDevelopmentPolicy,
	out: IDevelopmentPolicyViolation[],
): void => {
	if (policy.workspace.shared && !policy.coordination.requiresClaims) {
		out.push({
			rule: 'shared-tree-needs-claims',
			path: 'coordination.strategy',
			message:
				'Several agents share one working tree with no coordination, so two of them can write the same file at once.',
			remedy: 'Set `development.coordination.strategy` to "file-locks" or "sqlite-leases", or move to the "agent-worktree" workspace strategy.',
		});
	}

	if (
		policy.persistence.usesWipRefs &&
		!policy.integration.requiresPullRequest &&
		!policy.integration.requiresLocalCertification
	) {
		out.push({
			// Renamed from `wip-ref-needs-pull-request`: what a wip ref
			// needs is a certification, and a pull request is only one of
			// the two ways to get one. The old name made the "merge"
			// strategy look like a violation of a rule it satisfies.
			rule: 'wip-ref-needs-certification',
			path: 'integration.strategy',
			message:
				'Work is persisted to wip refs, but integration is direct — there is nowhere for a checkpoint to be certified before it lands.',
			remedy: 'Set `development.integration.strategy` to "pull-request" (the forge certifies) or "merge" (the local gate certifies), or persist with "direct-commit".',
		});
	}

	if (
		policy.workspace.agentWorktrees &&
		policy.persistence.strategy === 'direct-commit'
	) {
		out.push({
			rule: 'worktree-needs-own-ref',
			path: 'persistence.strategy',
			message:
				'Each agent has its own worktree, but work is committed straight onto the integration branch, which defeats the isolation.',
			remedy: 'Set `development.persistence.strategy` to "branch".',
		});
	}

	// There is deliberately NO rule here for the anchor or for local
	// certification. Both are derived in `derive.ts` from the strategy
	// they follow from, so the incoherent combination cannot be written
	// down in the first place — and a validation rule that can never fire
	// is a rule nobody can test. Durability below is different: it is a
	// genuine operator choice, so it is the operator's to get wrong.
	if (
		policy.recovery.resumeExistingWork &&
		policy.persistence.strategy === 'direct-commit'
	) {
		out.push({
			rule: 'recovery-needs-durable-ref',
			path: 'recovery.strategy',
			message:
				'Abandoned work cannot be resumed when it was committed directly to the integration branch — there is no separate ref to recover.',
			remedy: 'Use the "wip-ref" or "branch" persistence strategy, or set `development.recovery.strategy` to "none".',
		});
	}

	if (
		policy.integration.strategy === 'direct' &&
		policy.integration.requireLatestIntegration
	) {
		out.push({
			rule: 'direct-cannot-require-latest',
			path: 'integration.requireLatestIntegration',
			message:
				'Re-validation against the latest integration head is meaningless without a pull request to hold the candidate.',
			remedy: 'Either switch to "pull-request" integration or set `requireLatestIntegration` to false.',
		});
	}

	if (
		policy.integration.mergeGreenProgressContinuously &&
		!policy.integration.requiresPullRequest &&
		!policy.integration.requiresLocalCertification
	) {
		out.push({
			rule: 'green-progress-needs-certification',
			path: 'integration.mergeGreenProgressContinuously',
			message:
				'Green checkpoints cannot be integrated as they appear when nothing establishes that a checkpoint is green.',
			remedy: 'Switch to "pull-request" or "merge" integration, or turn `mergeGreenProgressContinuously` off.',
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
			message:
				'Governance is enforced and a pull request is required, but no check is required — the gate would pass anything.',
			remedy: 'List at least one required check context in `development.integration.requiredChecks`.',
		});
	}

	if (
		policy.checkpoint.strategy !== 'slice' &&
		policy.checkpoint.intervalMinutes <= 0
	) {
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
			message:
				'An approval count must be a whole number of people, and cannot be negative.',
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

	if (
		policy.coordination.requiresClaims &&
		policy.coordination.leaseTtlMinutes <= 0
	) {
		out.push({
			rule: 'claims-need-lease-ttl',
			path: 'coordination.leaseTtlMinutes',
			message:
				'Claims are required but leases never expire, so work abandoned by a dead agent would block its paths forever.',
			remedy: 'Set a positive `development.coordination.leaseTtlMinutes`.',
		});
	}

	if (
		policy.recovery.resumeExistingWork &&
		!policy.persistence.autoPushAfterCommit
	) {
		out.push({
			rule: 'resumable-work-must-leave-the-machine',
			path: 'persistence.autoPushAfterCommit',
			message:
				'Abandoned work is promised to be resumable, but checkpoints are never pushed — so the work exists in exactly one clone, and the agent that could resume it cannot see it.',
			remedy: 'Set `development.persistence.autoPushAfterCommit` to true, or set `development.recovery.strategy` to "none" and stop promising recovery.',
		});
	}
};

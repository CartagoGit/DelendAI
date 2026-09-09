/**
 * merge-step.ts — the critical section: the only place the integration
 * branch is allowed to advance, and the only place strict-latest is
 * enforced.
 *
 * THE INVARIANT. A candidate validated against integration head `A` must
 * not merge once the head is `A+X`. Two pull requests can each be green
 * against `A` and still produce a red branch together — nothing about
 * "both were green" implies "both are green in sequence". So the head is
 * re-read INSIDE the section, immediately before the merge, and:
 *
 *   head unchanged  → the recorded verdict still describes reality; merge.
 *   head moved      → the candidate is replayed onto the new head with
 *                     `rebaseWipOntoNewBase` and comes back as
 *                     `revalidating`. It does NOT merge on this pass, and
 *                     no verdict from the old base is carried forward.
 *
 * THE COMPARE-AND-SWAP. Re-reading is not enough on its own: the head can
 * move between the read and the merge. So the merge call itself carries
 * both expectations — the pull request's head sha and the base branch sha
 * — and the forge must refuse if either has changed. The failure mode
 * this produces is `stale`, a retry, rather than a merge that raced.
 *
 * WHAT IS AND IS NOT SERIALISED. Only this function runs under the
 * section, keyed on the integration branch. Checkpointing, pushing,
 * opening pull requests and waiting for CI all happen outside it, in
 * parallel, across the whole swarm.
 */

import type { IResolvedDevelopmentPolicy } from '../contracts/interfaces/development-policy.interface';
import { integrationSectionKey } from './critical-section';
import type { IIntegrationEngineDeps } from './engine-context';
import { integrationRepositoryUid } from './identity';
import { rebaseOntoHead, type IRebaseOutcome } from './rebase-step';
import type {
	IIntegrationCandidate,
	IIntegrationPullRequest,
	IValidationReport,
} from './types';
import { evaluateValidation } from './validation-step';

/** What the merge attempt is given. */
export interface IMergeStepInput {
	readonly policy: IResolvedDevelopmentPolicy;
	readonly candidate: IIntegrationCandidate;
	readonly pullRequest: IIntegrationPullRequest;
	/** Commit currently carried by the pull request. */
	readonly sha: string;
	/** Integration head this candidate was validated against. */
	readonly baseSha: string;
	readonly now: number;
}

/** Outcome of the critical section. */
export interface IMergeStepResult {
	readonly status:
		| 'merged'
		| 'blocked'
		| 'awaiting-checks'
		| 'awaiting-approval'
		| 'revalidating'
		| 'stale'
		| 'RECOVERY_CONFLICT'
		| 'failed';
	readonly candidateSha: string;
	readonly integrationHeadSha: string;
	readonly reason: string;
	readonly validation?: IValidationReport;
	readonly mergeSha?: string;
	readonly integratedSha?: string;
	readonly conflicts?: readonly string[];
	readonly idempotentReplay: boolean;
}

/** Mirror the forge's check runs into the state model, then record. */
const recordVerdict = async (
	deps: IIntegrationEngineDeps,
	input: IMergeStepInput,
	report: IValidationReport,
	checks: readonly { readonly name: string; readonly state: string }[],
): Promise<void> => {
	const repositoryUid = integrationRepositoryUid(input.candidate.repository);
	for (const check of checks) {
		await deps.state.upsertCiRun({
			repositoryUid,
			candidateSha: report.sha,
			workflow: 'required-checks',
			checkName: check.name,
			state: check.state as 'queued',
			now: input.now,
		});
	}
	await deps.state.recordValidation({
		workUnitUid: input.candidate.workUnitUid,
		generation: input.candidate.generation,
		validationState: report.verdict,
		now: input.now,
	});
};

/** Translate a rebase outcome into the section's own result shape. */
const fromRebase = (
	outcome: IRebaseOutcome,
	headSha: string,
): IMergeStepResult => ({
	status: outcome.status,
	candidateSha: outcome.candidateSha,
	integrationHeadSha: headSha,
	reason: outcome.reason,
	...(outcome.conflicts.length > 0 ? { conflicts: outcome.conflicts } : {}),
	idempotentReplay: false,
});

/** The whole critical section, from head read to recorded integration. */
const attempt = async (
	deps: IIntegrationEngineDeps,
	input: IMergeStepInput,
): Promise<IMergeStepResult> => {
	const { candidate, policy } = input;
	const target = candidate.repository;

	// Already integrated? Then this is a replay of a completed cycle and
	// must not merge, record or journal anything a second time.
	const known = await deps.state.getGeneration({
		workUnitUid: candidate.workUnitUid,
		generation: candidate.generation,
	});
	if (known?.integratedSha != null && known.integratedSha.length > 0) {
		return {
			status: 'merged',
			candidateSha: input.sha,
			integrationHeadSha: known.integratedSha,
			reason: `Generation ${String(candidate.generation)} is already recorded as integrated at ${known.integratedSha}.`,
			integratedSha: known.integratedSha,
			idempotentReplay: true,
		};
	}

	const head = await deps.forge.readIntegrationHead({
		target,
		branch: policy.branches.integration,
	});
	if (head === undefined) {
		return {
			status: 'failed',
			candidateSha: input.sha,
			integrationHeadSha: '',
			reason: `The integration head of '${policy.branches.integration}' could not be read; refusing to merge against an unknown base.`,
			idempotentReplay: false,
		};
	}

	// Strict latest-integration. A verdict earned against an older head is
	// not evidence about this one.
	if (
		policy.integration.requireLatestIntegration &&
		head.sha !== input.baseSha
	) {
		return fromRebase(
			await rebaseOntoHead(deps, {
				policy,
				candidate,
				sha: input.sha,
				oldBase: input.baseSha,
				newBase: head.sha,
				now: input.now,
			}),
			head.sha,
		);
	}

	const report = await deps.forge.readChecks({ target, sha: input.sha });
	const validation = evaluateValidation(policy, report);
	await recordVerdict(deps, input, validation, report.checks);
	if (validation.verdict === 'red') {
		return {
			status: 'blocked',
			candidateSha: input.sha,
			integrationHeadSha: head.sha,
			reason: validation.reason,
			validation,
			idempotentReplay: false,
		};
	}
	if (validation.verdict === 'pending') {
		return {
			status: 'awaiting-checks',
			candidateSha: input.sha,
			integrationHeadSha: head.sha,
			reason: validation.reason,
			validation,
			idempotentReplay: false,
		};
	}
	if (input.pullRequest.approvals < policy.integration.requiredApprovals) {
		return {
			status: 'awaiting-approval',
			candidateSha: input.sha,
			integrationHeadSha: head.sha,
			reason: `The policy requires ${String(policy.integration.requiredApprovals)} approving review(s); the pull request has ${String(input.pullRequest.approvals)}.`,
			validation,
			idempotentReplay: false,
		};
	}

	const merge = await deps.forge.mergePullRequest({
		target,
		number: input.pullRequest.number,
		baseBranch: policy.branches.integration,
		expectedHeadSha: input.sha,
		expectedBaseSha: head.sha,
		method: policy.integration.mergeMethod,
	});
	if (merge.status === 'stale-base' || merge.status === 'stale-head') {
		return {
			status: 'stale',
			candidateSha: input.sha,
			integrationHeadSha: head.sha,
			reason: `The merge was refused by the compare-and-swap: ${merge.reason}`,
			validation,
			idempotentReplay: false,
		};
	}
	if (merge.status !== 'merged') {
		return {
			status: merge.status === 'blocked' ? 'blocked' : 'failed',
			candidateSha: input.sha,
			integrationHeadSha: head.sha,
			reason: merge.reason,
			validation,
			idempotentReplay: false,
		};
	}

	const repositoryUid = integrationRepositoryUid(target);
	await deps.state.upsertPullRequest({
		repositoryUid,
		number: input.pullRequest.number,
		headRef: input.pullRequest.headBranch,
		baseRef: policy.branches.integration,
		headSha: input.sha,
		state: 'merged',
		mergeSha: merge.mergeSha,
		now: input.now,
	});
	const integrated = await deps.state.markIntegrated({
		workUnitUid: candidate.workUnitUid,
		generation: candidate.generation,
		integratedSha: merge.mergeSha,
		now: input.now,
	});
	if (integrated.first) {
		await deps.state.appendJournalEvent({
			eventKind: 'semantic-checkpoint',
			repositoryUid,
			workUnitUid: candidate.workUnitUid,
			proposalUid: candidate.proposalUid,
			sliceUid: candidate.sliceUid,
			generation: candidate.generation,
			actorAgentId: candidate.agentId,
			machineId: candidate.machineId,
			occurredAt: input.now,
			payload: {
				event: 'candidate-integrated',
				pullRequest: input.pullRequest.number,
				mergeSha: merge.mergeSha,
				integrationSha: merge.integrationSha,
			},
		});
	}
	return {
		status: 'merged',
		candidateSha: input.sha,
		integrationHeadSha: merge.integrationSha,
		reason: `Merged pull request #${String(input.pullRequest.number)} as ${merge.mergeSha}.`,
		validation,
		mergeSha: merge.mergeSha,
		integratedSha: merge.mergeSha,
		idempotentReplay: !integrated.first,
	};
};

/** Run the merge attempt under the integration branch's critical section. */
export const mergeCandidate = async (
	deps: IIntegrationEngineDeps,
	input: IMergeStepInput,
): Promise<IMergeStepResult> =>
	deps.criticalSection.run(
		integrationSectionKey(
			integrationRepositoryUid(input.candidate.repository),
			input.policy.branches.integration,
		),
		() => attempt(deps, input),
	);

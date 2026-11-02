/**
 * run-cycle.ts — the candidate lifecycle, end to end:
 *
 *   WIP ref → push → open/update PR → required CI → re-validate against
 *   the CURRENT integration head → merge → record integrated sha →
 *   delete the merged ref
 *
 * One pass of this function is one attempt. It never blocks waiting for
 * CI and never loops: a candidate whose checks are still running comes
 * back as `awaiting-checks`, a candidate that was overtaken comes back as
 * `revalidating`, and the caller decides when to try again. That is what
 * lets a swarm run hundreds of these concurrently while only the merge
 * itself is serialised (`merge-step.ts`).
 *
 * WHY the whole cycle is safe to run twice:
 *
 *  - the generation is upserted on `(workUnitUid, generation)`,
 *  - the pull request is found by a head branch derived from the work
 *    ref, so the second pass adopts the first pass's pull request,
 *  - the integrated sha is a single-winner transition, and the journal
 *    events are gated on those transitions actually happening,
 *  - and a generation already recorded as integrated short-circuits
 *    inside the critical section before anything is written.
 *
 * Nothing here is gated on a timestamp or a local flag, so a second pass
 * on a different machine converges the same way.
 */

import { disposeWorkRef } from './cleanup-step';
import type { IIntegrationEngineDeps } from './engine-context.interface';
import { candidateBranchName } from './identity';
import { mergeCandidate, type IMergeStepResult } from './merge-step';
import { gateIntegration } from './policy-gate';
import { ensurePullRequest } from './pull-request-step';
import type { IIntegrationCycleResult, IIntegrationPullRequest } from './types';

import type { IIntegrationCycleRequest } from './run-cycle.interface';

export type { IIntegrationCycleRequest } from './run-cycle.interface';

const declined = (reason: string): IIntegrationCycleResult => ({
	status: 'declined',
	candidateSha: '',
	integrationHeadSha: '',
	reason,
	idempotentReplay: false,
});

/**
 * The status a caller sees when the merge could not happen yet but the
 * pull request itself moved. "Opened" is more useful than "awaiting
 * checks" on the pass that created it — it is the fact that changed.
 */
const publishStatus = (
	merge: IMergeStepResult,
	step: 'opened' | 'updated' | 'unchanged',
): IIntegrationCycleResult['status'] =>
	merge.status === 'awaiting-checks' && step !== 'unchanged'
		? step
		: merge.status;

/**
 * The answer for a cycle whose candidate is already integrated. Nothing
 * is written; the pull request is only READ, so no second one can be
 * opened, and the disposition is recomputed from durable evidence.
 */
const replayResult = async (
	deps: IIntegrationEngineDeps,
	request: IIntegrationCycleRequest,
	integratedSha: string,
): Promise<IIntegrationCycleResult> => {
	const { candidate, policy } = request;
	const pullRequest = await deps.forge.findPullRequest({
		target: candidate.repository,
		headBranch: candidateBranchName(candidate.wipRef),
		baseBranch: policy.branches.integration,
	});
	const head = await deps.forge.readIntegrationHead({
		target: candidate.repository,
		branch: policy.branches.integration,
	});
	const integrationHeadSha = head?.sha ?? integratedSha;
	const disposition = await disposeWorkRef(deps, {
		policy,
		candidate,
		...(pullRequest === undefined ? {} : { pullRequest }),
		mergeSha: pullRequest?.mergeSha ?? integratedSha,
		integratedSha,
		integrationHeadSha,
		wipHeadSha: candidate.wipHeadSha,
	});
	return {
		status: 'merged',
		candidateSha: candidate.wipHeadSha,
		integrationHeadSha,
		reason: `Generation ${String(candidate.generation)} was already integrated at ${integratedSha}; this cycle changed nothing.`,
		...(pullRequest === undefined ? {} : { pullRequest }),
		integratedSha,
		disposition,
		...(policy.integration.mergeGreenProgressContinuously
			? {
					nextGeneration: {
						generation: candidate.generation + 1,
						baseIntegrationSha: integrationHeadSha,
					},
				}
			: {}),
		idempotentReplay: true,
	};
};

/** Run one full integration attempt for one candidate. */
export const runIntegrationCycle = async (
	deps: IIntegrationEngineDeps,
	request: IIntegrationCycleRequest,
): Promise<IIntegrationCycleResult> => {
	const { candidate, policy } = request;
	const gate = gateIntegration(policy);
	if (!gate.allowed) return declined(gate.reason);

	const now = request.now ?? deps.clock();

	// A generation already recorded as integrated is a completed cycle.
	// Short-circuiting here — before anything is pushed or opened — is what
	// makes a second pass free of side effects rather than merely
	// harmless: nothing is written, and the work ref's disposition is
	// re-reported from evidence that is already durable.
	const recorded = await deps.state.getGeneration({
		workUnitUid: candidate.workUnitUid,
		generation: candidate.generation,
	});
	if (recorded?.integratedSha != null && recorded.integratedSha.length > 0) {
		return replayResult(deps, request, recorded.integratedSha);
	}

	await deps.state.ensureGeneration({
		workUnitUid: candidate.workUnitUid,
		generation: candidate.generation,
		baseIntegrationSha: candidate.baseIntegrationSha,
		wipRef: candidate.wipRef,
		wipHeadSha: candidate.wipHeadSha,
		patchDigest: candidate.patchDigest,
		fileScope: candidate.fileScope,
		checkpointKind: 'merge-candidate',
		authorAgentId: candidate.agentId,
		machineId: candidate.machineId,
		now,
	});

	const published = await ensurePullRequest(deps, {
		policy,
		candidate,
		sha: candidate.wipHeadSha,
		replayed: false,
		now,
	});
	if (published.status === 'failed' || published.pullRequest === undefined) {
		return {
			status: 'failed',
			candidateSha: candidate.wipHeadSha,
			integrationHeadSha: '',
			reason: published.reason,
			idempotentReplay: false,
		};
	}
	const pullRequest: IIntegrationPullRequest = published.pullRequest;

	const merge = await mergeCandidate(deps, {
		policy,
		candidate,
		pullRequest,
		sha: candidate.wipHeadSha,
		baseSha: candidate.baseIntegrationSha,
		now,
	});

	const base: IIntegrationCycleResult = {
		status: publishStatus(merge, published.status),
		candidateSha: merge.candidateSha,
		integrationHeadSha: merge.integrationHeadSha,
		reason: merge.reason,
		pullRequest,
		...(merge.validation === undefined
			? {}
			: { validation: merge.validation }),
		...(merge.conflicts === undefined
			? {}
			: { conflicts: merge.conflicts }),
		idempotentReplay: merge.idempotentReplay,
	};
	if (merge.status !== 'merged') return base;

	const integratedSha = merge.integratedSha ?? '';
	const disposition = await disposeWorkRef(deps, {
		policy,
		candidate,
		pullRequest: { ...pullRequest, state: 'merged' },
		mergeSha: merge.mergeSha ?? '',
		integratedSha,
		integrationHeadSha: merge.integrationHeadSha,
		wipHeadSha: candidate.wipHeadSha,
	});

	return {
		...base,
		...(merge.mergeSha === undefined ? {} : { mergeSha: merge.mergeSha }),
		integratedSha,
		disposition,
		// Continuous green progress: the slice is NOT closed here, and its
		// next generation starts from the head this merge just produced.
		...(policy.integration.mergeGreenProgressContinuously
			? {
					nextGeneration: {
						generation: candidate.generation + 1,
						baseIntegrationSha: merge.integrationHeadSha,
					},
				}
			: {}),
	};
};

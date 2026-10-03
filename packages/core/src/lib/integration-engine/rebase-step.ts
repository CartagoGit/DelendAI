/**
 * rebase-step.ts — bringing a stale candidate up to the CURRENT
 * integration head, which is the other half of strict-latest.
 *
 * Detecting that the head moved is worthless without a way to act on it.
 * The action is deliberately NOT "merge anyway and let the forge sort it
 * out": the candidate is replayed onto the new head with the WIP engine's
 * `rebaseWipOntoNewBase`, republished, and marked `pending` again, so the
 * next verdict is earned against the head it will actually merge into.
 *
 * Three properties are load-bearing here:
 *
 *  - A conflict is a RESULT, never an exception, and never moves the ref.
 *    The old checkpoint stays exactly where it was, still recoverable, and
 *    the conflicting paths are named so a human or another agent can act.
 *  - The republish is a compare-and-swap on the previously published sha.
 *    A replay is not a fast-forward by construction, so a plain force push
 *    would happily erase a checkpoint pushed in between; the lease refuses
 *    instead.
 *  - The verdict is RESET, not carried over. A green from the old base is
 *    not evidence about the new one, and leaving it in place would let the
 *    very race this engine exists to prevent slip through on the next pass.
 */

import type { IIntegrationEngineDeps } from './engine-context.interface';
import { candidateBranchName, integrationRepositoryUid } from './identity';

import type { IRebaseStepInput, IRebaseOutcome } from './rebase-step.interface';

export type {
	IRebaseStepInput,
	IRebaseOutcome,
} from './rebase-step.interface';

/** Make sure the new base exists locally before asking git to replay onto it. */
const ensureBaseObject = async (
	deps: IIntegrationEngineDeps,
	input: IRebaseStepInput,
): Promise<boolean> => {
	if ((await deps.git.resolveRevision(input.newBase)) !== undefined)
		return true;
	const branch = input.policy.branches.integration;
	await deps.git.fetch(
		input.candidate.repository.remote,
		`+refs/heads/${branch}:refs/remotes/${input.candidate.repository.remote}/${branch}`,
	);
	return (await deps.git.resolveRevision(input.newBase)) !== undefined;
};

/** Replay the candidate onto `newBase` and republish it. */
export const rebaseOntoHead = async (
	deps: IIntegrationEngineDeps,
	input: IRebaseStepInput,
): Promise<IRebaseOutcome> => {
	const { candidate } = input;
	if (!(await ensureBaseObject(deps, input))) {
		return {
			status: 'failed',
			candidateSha: input.sha,
			conflicts: [],
			reason: `The new integration head ${input.newBase} is not present locally, so the candidate cannot be replayed onto it.`,
		};
	}

	const replay = await deps.wip.rebaseWipOntoNewBase({
		ref: candidate.wipRef,
		oldBase: input.oldBase,
		newBase: input.newBase,
	});
	if (replay.status === 'RECOVERY_CONFLICT') {
		return {
			status: 'RECOVERY_CONFLICT',
			candidateSha: input.sha,
			conflicts: replay.conflicts,
			reason:
				replay.reason ??
				`${candidate.wipRef} cannot be replayed onto ${input.newBase}.`,
		};
	}
	if (replay.status === 'failed') {
		return {
			status: 'failed',
			candidateSha: input.sha,
			conflicts: [],
			reason: replay.reason ?? 'The replay failed.',
		};
	}

	const branch = candidateBranchName(candidate.wipRef);
	const push = await deps.git.pushRef({
		remote: candidate.repository.remote,
		localRef: candidate.wipRef,
		branch,
		force: true,
		expectedRemoteSha: input.sha,
	});
	if (!push.ok) {
		return {
			status: 'failed',
			candidateSha: replay.commit,
			conflicts: [],
			reason: `The replayed candidate could not be published to '${branch}': ${push.reason}`,
		};
	}

	await deps.state.ensureGeneration({
		workUnitUid: candidate.workUnitUid,
		generation: candidate.generation,
		baseIntegrationSha: input.newBase,
		wipRef: candidate.wipRef,
		wipHeadSha: replay.commit,
		patchDigest: replay.patchDigest,
		fileScope: candidate.fileScope,
		checkpointKind: 'merge-candidate',
		authorAgentId: candidate.agentId,
		machineId: candidate.machineId,
		now: input.now,
	});
	await deps.state.recordValidation({
		workUnitUid: candidate.workUnitUid,
		generation: candidate.generation,
		validationState: 'pending',
		now: input.now,
	});
	// Journalled only on a replay that actually moved the ref: the same
	// (oldBase → newBase) transition cannot recur, so this cannot duplicate.
	if (replay.status === 'rebased') {
		await deps.state.appendJournalEvent({
			eventKind: 'recovery-decision',
			repositoryUid: integrationRepositoryUid(candidate.repository),
			workUnitUid: candidate.workUnitUid,
			proposalUid: candidate.proposalUid,
			sliceUid: candidate.sliceUid,
			generation: candidate.generation,
			actorAgentId: candidate.agentId,
			machineId: candidate.machineId,
			occurredAt: input.now,
			payload: {
				event: 'candidate-rebased',
				fromBase: input.oldBase,
				toBase: input.newBase,
				fromSha: input.sha,
				toSha: replay.commit,
			},
		});
	}

	return {
		status: 'revalidating',
		candidateSha: replay.commit,
		conflicts: [],
		reason: `The integration head moved to ${input.newBase}; the candidate was replayed onto it and must be validated again before it may merge.`,
	};
};

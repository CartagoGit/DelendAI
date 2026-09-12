/**
 * cleanup-step.ts — deleting a work ref ONLY on durable evidence that its
 * content is already represented in the integration branch.
 *
 * There is no age here. Not a TTL, not a "stale after N days" sweep, not
 * a heuristic about the last checkpoint time. An old ref and an abandoned
 * ref look identical from the outside, and the difference between them is
 * an agent's whole day of work. `recovery.neverDiscardUnmergedWork` says
 * so as policy; this file is where it is mechanically true.
 *
 * The evidence is three recorded facts plus, where the merge shape allows
 * it, a proof:
 *
 *   1. the forge says the pull request carrying the ref is merged,
 *   2. there is a merge commit,
 *   3. the state model recorded the generation as integrated at a sha,
 *   4. and for a real merge commit, the checkpoint is an ANCESTOR of the
 *      integration head — asked of git, not assumed.
 *
 * Squash and rebase merges rewrite the commit by design, so ancestry is
 * `not-applicable` there and the recorded merge is the evidence. That is
 * a deliberate limit, spelled out in the disposition rather than hidden.
 *
 * Anything short of complete evidence yields `RECOVERABLE` and a
 * RETAINED ref. Unmerged work is never garbage.
 */

import type { IIntegrationEngineDeps } from './engine-context.interface';
import { candidateBranchName } from './identity';
import type {
	IIntegrationCandidate,
	IWorkRefDisposition,
	IWorkRefEvidence,
} from './types';

import type { ICleanupStepInput } from './cleanup-step.interface';

export type { ICleanupStepInput } from './cleanup-step.interface';

/** Gather the evidence. Pure observation — nothing is deleted here. */
export const collectEvidence = async (
	deps: IIntegrationEngineDeps,
	input: ICleanupStepInput,
): Promise<IWorkRefEvidence> => {
	const merged =
		input.pullRequest?.state === 'merged' || input.mergeSha.length > 0;
	const ancestry: IWorkRefEvidence['ancestry'] =
		input.policy.integration.mergeMethod !== 'merge'
			? 'not-applicable'
			: input.integrationHeadSha.length > 0 &&
					(await deps.git.isAncestor(
						input.wipHeadSha,
						input.integrationHeadSha,
					))
				? 'confirmed'
				: 'absent';
	return {
		pullRequestMerged: merged,
		mergeSha: input.mergeSha,
		integratedSha: input.integratedSha,
		ancestry,
	};
};

/** True only when every fact required to delete is present. */
const isComplete = (evidence: IWorkRefEvidence): boolean =>
	evidence.pullRequestMerged &&
	evidence.mergeSha.length > 0 &&
	evidence.integratedSha.length > 0 &&
	evidence.ancestry !== 'absent';

const retained = (
	candidate: IIntegrationCandidate,
	evidence: IWorkRefEvidence,
	classification: IWorkRefDisposition['classification'],
	reason: string,
): IWorkRefDisposition => ({
	ref: candidate.wipRef,
	classification,
	action: 'retained',
	reason,
	evidence,
});

/**
 * Decide, and act. The local ref is deleted with a compare-and-swap on
 * the sha we inspected, so a checkpoint written between the decision and
 * the delete survives instead of being silently discarded.
 */
export const disposeWorkRef = async (
	deps: IIntegrationEngineDeps,
	input: ICleanupStepInput,
): Promise<IWorkRefDisposition> => {
	const { candidate, policy } = input;
	const evidence = await collectEvidence(deps, input);

	if (!isComplete(evidence)) {
		return retained(
			candidate,
			evidence,
			'RECOVERABLE',
			`${candidate.wipRef} is not provably represented in '${policy.branches.integration}' (merged=${String(evidence.pullRequestMerged)}, mergeSha=${evidence.mergeSha || 'none'}, integratedSha=${evidence.integratedSha || 'none'}, ancestry=${evidence.ancestry}); it is retained and RECOVERABLE.`,
		);
	}
	if (!policy.integration.deleteMergedWorkRef) {
		return retained(
			candidate,
			evidence,
			'integrated',
			`${candidate.wipRef} is integrated, but integration.deleteMergedWorkRef is false, so it is kept.`,
		);
	}

	// A ref that is already gone is the same outcome, not a failure: a
	// second pass over a completed cycle must report what is true, not
	// invent a problem out of its own success.
	if ((await deps.git.resolveRevision(candidate.wipRef)) === undefined) {
		return {
			ref: candidate.wipRef,
			classification: 'integrated',
			action: 'deleted',
			reason: `${candidate.wipRef} is integrated at ${evidence.integratedSha} and no longer exists locally.`,
			evidence,
		};
	}

	const local = await deps.git.deleteRef({
		ref: candidate.wipRef,
		expectedSha: input.wipHeadSha,
	});
	if (!local.ok) {
		return retained(
			candidate,
			evidence,
			'integrated',
			`${candidate.wipRef} is integrated but was not deleted: ${local.reason}`,
		);
	}
	await deps.forge.deleteBranch({
		target: candidate.repository,
		branch: candidateBranchName(candidate.wipRef),
		expectedSha: input.wipHeadSha,
	});
	return {
		ref: candidate.wipRef,
		classification: 'integrated',
		action: 'deleted',
		reason: `${candidate.wipRef} is represented in '${policy.branches.integration}' at ${evidence.integratedSha}; the merged work ref was deleted.`,
		evidence,
	};
};

/**
 * pull-request-step.ts — publish the candidate and make sure exactly ONE
 * pull request carries it.
 *
 * The idempotency rule lives here and is structural rather than
 * defensive: the head branch is a pure function of the work ref
 * (`identity.ts`), so the step always LOOKS the pull request up by that
 * branch before it considers opening one. A second run of the same cycle
 * therefore finds the first run's pull request. There is no "have I
 * opened it yet?" flag to get out of sync, and no dependence on the state
 * model having been written — the forge itself answers the question.
 *
 * The push is a compare-and-swap whenever a previous head is known. That
 * is what stops a replayed candidate from erasing a checkpoint another
 * process pushed in between: the lease refuses, and the cycle comes back
 * to look at what actually happened rather than overwriting it.
 */

import type { IResolvedDevelopmentPolicy } from '../contracts/interfaces/development-policy.interface';
import type { IIntegrationEngineDeps } from './engine-context';
import {
	candidateBody,
	candidateBranchName,
	integrationRepositoryUid,
} from './identity';
import type { IIntegrationCandidate, IIntegrationPullRequest } from './types';

/** What to publish, and where it came from. */
export interface IPullRequestStepInput {
	readonly policy: IResolvedDevelopmentPolicy;
	readonly candidate: IIntegrationCandidate;
	/** Commit to publish: the checkpoint's, or a replayed one. */
	readonly sha: string;
	/** True when the history was replayed and is not a fast-forward. */
	readonly replayed: boolean;
	readonly now: number;
}

/** Outcome of publishing plus opening-or-updating the pull request. */
export interface IPullRequestStepResult {
	readonly status: 'opened' | 'updated' | 'unchanged' | 'failed';
	readonly reason: string;
	readonly pullRequest?: IIntegrationPullRequest;
}

/**
 * Publish `sha` to the candidate branch and return the single pull
 * request that carries it, opening one only when the forge has none.
 */
export const ensurePullRequest = async (
	deps: IIntegrationEngineDeps,
	input: IPullRequestStepInput,
): Promise<IPullRequestStepResult> => {
	const { candidate, policy } = input;
	const target = candidate.repository;
	const branch = candidateBranchName(candidate.wipRef);
	const base = policy.branches.integration;

	const existing = await deps.forge.findPullRequest({
		target,
		headBranch: branch,
		baseBranch: base,
	});

	const push = await deps.git.pushRef({
		remote: target.remote,
		localRef: candidate.wipRef,
		branch,
		force: input.replayed,
		...(existing === undefined
			? {}
			: { expectedRemoteSha: existing.headSha }),
	});
	if (!push.ok) {
		return {
			status: 'failed',
			reason: `The candidate could not be published to '${branch}': ${push.reason}`,
		};
	}

	const pullRequest =
		existing ??
		(await deps.forge.openPullRequest({
			target,
			headBranch: branch,
			baseBranch: base,
			title: candidate.title,
			body:
				candidate.body ??
				candidateBody({
					proposalUid: candidate.proposalUid,
					sliceUid: candidate.sliceUid,
					generation: candidate.generation,
					baseIntegrationSha: candidate.baseIntegrationSha,
					patchDigest: candidate.patchDigest,
					fileScope: candidate.fileScope,
				}),
		}));
	if (pullRequest === undefined) {
		return {
			status: 'failed',
			reason: `No pull request could be opened for '${branch}'.`,
		};
	}

	const carried: IIntegrationPullRequest = {
		...pullRequest,
		headSha: input.sha,
	};
	await deps.state.upsertPullRequest({
		repositoryUid: integrationRepositoryUid(target),
		number: carried.number,
		headRef: branch,
		baseRef: base,
		headSha: carried.headSha,
		state: carried.state,
		...(carried.mergeSha === undefined
			? {}
			: { mergeSha: carried.mergeSha }),
		now: input.now,
	});
	const attach = await deps.state.attachPullRequest({
		workUnitUid: candidate.workUnitUid,
		generation: candidate.generation,
		pullRequestNumber: carried.number,
		now: input.now,
	});
	if (attach.attached) {
		await deps.state.appendJournalEvent({
			eventKind: 'semantic-checkpoint',
			repositoryUid: integrationRepositoryUid(target),
			workUnitUid: candidate.workUnitUid,
			proposalUid: candidate.proposalUid,
			sliceUid: candidate.sliceUid,
			generation: candidate.generation,
			actorAgentId: candidate.agentId,
			machineId: candidate.machineId,
			occurredAt: input.now,
			payload: {
				event: 'candidate-proposed',
				pullRequest: carried.number,
				sha: input.sha,
			},
		});
	}

	if (existing === undefined) {
		return {
			status: 'opened',
			reason: `Opened pull request #${String(carried.number)} for '${branch}'.`,
			pullRequest: carried,
		};
	}
	return {
		status: existing.headSha === input.sha ? 'unchanged' : 'updated',
		reason:
			existing.headSha === input.sha
				? `Pull request #${String(carried.number)} already carries ${input.sha}.`
				: `Pull request #${String(carried.number)} advanced to ${input.sha}.`,
		pullRequest: carried,
	};
};

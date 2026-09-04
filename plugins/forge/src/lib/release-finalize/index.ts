import {
	assertExpectedFinalReleaseState,
	buildReleaseReceipt,
	ReleaseStateError,
	type IExpectedFinalReleaseState,
	type IReleaseCandidateMetadata,
	type IReleaseReceipt,
	type IReleaseReadiness,
} from '@delendai/core/public';

import type { IForgePullRequestDetail } from '../contracts/interfaces/forge-read.interface';

export type PullRequestReader = (
	pullRequest: string,
) => Promise<IForgePullRequestDetail>;

export const stabilizeRelease = (
	candidate: IReleaseCandidateMetadata,
	readiness: IReleaseReadiness,
	actor: string,
): IReleaseReceipt => {
	if (!readiness.ready)
		throw new ReleaseStateError(
			'readiness-blocked',
			'release is not ready',
		);
	return buildReleaseReceipt({
		operation: 'stabilize',
		status: 'completed',
		actor,
		releaseSlug: candidate.slug,
		source: candidate.branch,
		details: { targetVersion: candidate.targetVersion },
	});
};

export const finalizeRelease = async (
	read: PullRequestReader,
	candidate: IReleaseCandidateMetadata,
	expected: IExpectedFinalReleaseState,
	readiness: IReleaseReadiness,
	actor: string,
	pullRequest: string,
): Promise<IReleaseReceipt> => {
	if (!readiness.ready)
		throw new ReleaseStateError(
			'readiness-blocked',
			'release is not ready',
		);
	const pr = await read(pullRequest);
	const headBranch = pr.headBranch ?? pr.branch;
	const baseBranch = pr.baseBranch ?? 'main';
	if (headBranch !== candidate.branch || baseBranch !== 'main')
		throw new Error(
			'release PR must target main from the candidate branch',
		);
	if (pr.state !== 'MERGED')
		throw new Error('finalize requires Forge to report the PR as merged');
	const releaseBranchSha = pr.headSha;
	const mainSha = pr.mergeCommitSha;
	if (releaseBranchSha === undefined || mainSha === undefined)
		throw new Error(
			'finalize requires Forge commit SHAs for the merged PR',
		);
	assertExpectedFinalReleaseState(expected, {
		releaseBranchSha,
		mainSha,
		targetVersion: candidate.targetVersion,
	});
	return buildReleaseReceipt({
		operation: 'finalize',
		status: 'completed',
		actor,
		releaseSlug: candidate.slug,
		source: candidate.branch,
		target: 'main',
		before: expected.mainSha,
		after: mainSha,
		details: { pullRequest: pullRequest },
	});
};

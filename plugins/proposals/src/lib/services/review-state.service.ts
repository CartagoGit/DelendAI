/**
 * review-state.service.ts — the one place that says whether a proposal in
 * review is being reviewed.
 *
 * `review` read the same for twelve proposals with a swarm of reviewers at
 * work on some of them. The claim is the record of a reviewer on a
 * proposal: a commit in its review unit, on the forge as soon as it is
 * made, which lapses when its holder goes quiet and ends when its pack
 * lands or is retired. A proposal in review that a claim holds is
 * `in-review`; one nobody holds waits. Every surface asks this.
 */
import type { IResolvedDevelopmentPolicy } from '@delendai/core/public';

import type {
	IReviewersAtWork,
	IReviewState,
} from '../contracts/interfaces/review-state.interface';
import { createGitRunner, type IGitRunner } from '../shared/git-runner';
import { claimHolding } from './claim-liveness.service';
import { reviewClaims } from './review-claims.service';

/** Who is reviewing what now, by the claims that still hold. */
export const reviewersAtWork = async (
	root: string,
	policy: IResolvedDevelopmentPolicy,
	run: IGitRunner = createGitRunner(root),
): Promise<IReviewersAtWork> => {
	const claims = await reviewClaims(
		run,
		policy.branches,
		policy.branches.integration,
		await claimHolding(root, policy),
	);
	return new Map(
		[...claims.entries()]
			.map(([id, holders]): [string, string[]] => [
				id,
				[...new Set(holders.map((holder) => holder.agent))].sort(),
			])
			.filter(([, agents]) => agents.length > 0),
	);
};

/** Whether a proposal in review waits for a reviewer or has one. */
export const reviewStateOf = (
	proposalId: string,
	atWork: IReviewersAtWork,
): IReviewState =>
	atWork.has(proposalId.toLowerCase()) ? 'in-review' : 'review';

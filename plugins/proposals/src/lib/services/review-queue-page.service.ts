/**
 * review-queue-page.service.ts — which part of the review backlog one call
 * returns (x00717).
 *
 * Six reviewers asking at once were all handed the same ten oldest
 * proposals of 83, collided on the first, and never saw the rest: the
 * answer had no offset and no next step, and a claim only shows once it
 * is made. The backlog is now paged with the next call named, and a
 * reviewer that names itself starts at its own point among the free
 * proposals.
 */
import type {
	IBuildReviewQueueInput,
	IReviewQueue,
	IReviewQueueProposal,
} from '../contracts/interfaces/review-queue.interface';

/**
 * The page of `reviewed` this call returns: free proposals first, rotated
 * to the reviewer's own start, then the ones another reviewer holds.
 */
export const pageOfQueue = (
	reviewed: readonly IReviewQueueProposal[],
	input: Pick<
		IBuildReviewQueueInput,
		| 'namespacePrefix'
		| 'limit'
		| 'offset'
		| 'agent'
		| 'proposalId'
		| 'spread'
	>,
): Pick<IReviewQueue, 'proposals' | 'page'> => {
	const free = reviewed.filter(
		(proposal) => proposal.claimedBy === undefined,
	);
	const start =
		input.proposalId === undefined &&
		input.spread !== undefined &&
		free.length > 0
			? input.spread % free.length
			: 0;
	const ordered = [
		...free.slice(start),
		...free.slice(0, start),
		...reviewed.filter((proposal) => proposal.claimedBy !== undefined),
	];
	const offset = Math.min(input.offset ?? 0, ordered.length);
	const proposals = ordered.slice(offset, offset + input.limit);
	const after = offset + proposals.length;
	const agent = input.agent === undefined ? '' : `, agent: "${input.agent}"`;
	return {
		proposals,
		page: {
			offset,
			returned: proposals.length,
			total: ordered.length,
			...(after < ordered.length
				? {
						next: `${input.namespacePrefix}_review_queue { offset: ${String(after)}${agent} } — ${String(ordered.length - after)} more`,
					}
				: {}),
		},
	};
};

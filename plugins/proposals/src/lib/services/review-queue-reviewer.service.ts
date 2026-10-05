/**
 * review-queue-reviewer.service.ts — the queue offers a reviewer no work
 * it cannot judge.
 *
 * Where a project asks for another model to review, a slice its asker
 * delivered was listed to it as needing a verdict, with the call that
 * records one. `review next` claimed it, the reviewer read it, and the
 * approval was refused as a self-approval at the last step: a turn of a
 * swarm spent on nothing, and a claim that kept everybody else out
 * meanwhile. The refusal was right; offering the work was not.
 */
import type {
	IReviewQueue,
	IReviewQueueSlice,
} from '../contracts/interfaces/review-queue.interface';
import type { IReviewIndependence } from '../contracts/interfaces/review-independence.interface';
import { isSelfApproval } from '../shared/independent-approval';

const anothers = (
	slice: IReviewQueueSlice,
	agent: string,
): IReviewQueueSlice => ({
	...slice,
	verdict: 'needs-another-reviewer',
	nextAction: `${slice.implementer ?? 'The same model'} delivered this, and this project asks for another model to review it: you (${agent}) cannot. Leave it for another reviewer and take a proposal with a slice that needs a verdict.`,
});

/**
 * The queue as `agent` may act on it. Under model independence a slice
 * waiting for a verdict that the asker's own model delivered waits for
 * another reviewer instead. Where another instance of the same model may
 * review, nothing changes: the queue cannot tell two instances apart, and
 * the approval itself decides.
 */
export const queueForReviewer = (
	queue: IReviewQueue,
	agent: string | undefined,
	independence: IReviewIndependence | undefined,
): IReviewQueue => {
	if (agent === undefined || independence !== 'model') return queue;
	let moved = 0;
	const proposals = queue.proposals.map((proposal) => ({
		...proposal,
		slices: proposal.slices.map((slice) => {
			if (
				slice.verdict !== 'needs-verdict' ||
				slice.implementerSource === 'unrecorded' ||
				!isSelfApproval(slice.implementer, agent, independence)
			)
				return slice;
			moved += 1;
			return anothers(slice, agent);
		}),
	}));
	return moved === 0
		? queue
		: {
				...queue,
				proposals,
				totals: {
					...queue.totals,
					needsVerdict: Math.max(
						0,
						queue.totals.needsVerdict - moved,
					),
				},
			};
};

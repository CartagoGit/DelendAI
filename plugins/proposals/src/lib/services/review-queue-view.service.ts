/**
 * review-queue-view.service.ts — what one `review_queue` call returns
 * (x00673).
 *
 * The whole backlog came back with every slice in full: its delivery
 * candidates, files, acceptance, later commits and next action. Forty
 * proposals were 624 KB, and a reviewer spent its context on proposals
 * it was not going to review. The list is what a reviewer chooses from:
 * each slice's state, and each proposal's claim or close. The detail is
 * for the proposal it has chosen, asked for by `proposalId`.
 */
import type {
	IReviewQueue,
	IReviewQueueSlice,
} from '../contracts/interfaces/review-queue.interface';

/** A slice as the list shows it: its state, not its evidence. */
const summaryOf = (slice: IReviewQueueSlice) => ({
	sliceId: slice.sliceId,
	title: slice.title,
	status: slice.status,
	reviewState: slice.reviewState,
	verdict: slice.verdict,
	...(slice.missing === undefined ? {} : { missing: slice.missing }),
});

/** The queue as the list shows it, when no single proposal is asked for. */
export const compactQueue = (queue: IReviewQueue) => ({
	...queue,
	proposals: queue.proposals.map((proposal) => ({
		...proposal,
		slices: proposal.slices.map(summaryOf),
	})),
});

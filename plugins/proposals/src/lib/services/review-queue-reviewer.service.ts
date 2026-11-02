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
	deliveredBy: string | undefined,
): IReviewQueueSlice => ({
	...slice,
	verdict: 'needs-another-reviewer',
	nextAction:
		deliveredBy === undefined
			? `${slice.implementer ?? 'The same model'} delivered this, and this project asks for another model to review it: you (${agent}) cannot. Leave it for another reviewer and take a proposal with a slice that needs a verdict.`
			: `Your own unit of work (${deliveredBy}) delivered part of this: you (${agent}) are one of its implementers and cannot judge it. Leave it for another reviewer and take a proposal with a slice that needs a verdict.`,
});

/**
 * The agent of a unit of work that delivered `slice` and that `agent`
 * may not approve: the same identity always, and the same model where the
 * project asks for another model. The round names only the agent that
 * submitted; another agent's publication delivering the same slice made
 * it an implementer too.
 */
const deliveredByReviewer = (
	slice: IReviewQueueSlice,
	agent: string,
	independence: IReviewIndependence | undefined,
): string | undefined =>
	(slice.candidates ?? [])
		.map((candidate) => candidate.agent)
		.find(
			(deliverer): deliverer is string =>
				deliverer !== undefined &&
				(sameIdentity(deliverer, agent) ||
					(independence === 'model' &&
						isSelfApproval(deliverer, agent, independence))),
		);

/** Two spellings of one identity: compared by letters and digits. */
const sameIdentity = (a: string, b: string): boolean =>
	a.toLowerCase().replaceAll(/[^a-z0-9]/gu, '') ===
	b.toLowerCase().replaceAll(/[^a-z0-9]/gu, '');

/**
 * The queue as `agent` may act on it. Under model independence a slice
 * waiting for a verdict that the asker's own model delivered waits for
 * another reviewer instead. Under any independence, so does a slice a
 * unit of the asker's own identity delivered: its ref names the asker.
 * Where another instance of the same model may review a slice the asker
 * did not deliver, the queue cannot tell instances apart, and the
 * approval itself decides.
 */
export const queueForReviewer = (
	queue: IReviewQueue,
	agent: string | undefined,
	independence: IReviewIndependence | undefined,
): IReviewQueue => {
	if (agent === undefined) return queue;
	let moved = 0;
	const proposals = queue.proposals.map((proposal) => ({
		...proposal,
		slices: proposal.slices.map((slice) => {
			if (slice.verdict !== 'needs-verdict') return slice;
			const deliveredBy = deliveredByReviewer(slice, agent, independence);
			const submittedBy =
				independence === 'model' &&
				slice.implementerSource !== 'unrecorded' &&
				isSelfApproval(slice.implementer, agent, independence);
			if (deliveredBy === undefined && !submittedBy) return slice;
			moved += 1;
			return anothers(slice, agent, deliveredBy);
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

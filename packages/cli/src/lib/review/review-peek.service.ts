/**
 * review-peek.service.ts — asking whether there is work is not taking it.
 *
 * `review next` without a session entered a new review unit before it
 * read the queue. An agent that asked every few minutes and kept no
 * session left one empty unit per question: ten of one model's, with no
 * commit and no claim, sat in the repository while it waited for work.
 * Without a session, the queue is read first, and a unit is entered only
 * for a proposal waiting for a verdict that nobody holds.
 */
import type { IQueue } from '../../contracts/interfaces/review-queue-view.interface';

/** Whether the queue has a proposal `agent` could take now. */
export const anythingWaiting = async (
	readQueue: () => Promise<IQueue>,
): Promise<boolean> =>
	((await readQueue()).proposals ?? []).some(
		(proposal) =>
			proposal.claimedBy === undefined &&
			proposal.slices.some((slice) => slice.verdict === 'needs-verdict'),
	);

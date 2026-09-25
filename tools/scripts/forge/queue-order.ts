/**
 * queue-order.ts — which candidate moves next.
 *
 * Bringing every open candidate forward each time the integration branch
 * moved put a `Merge develop into …` commit on every candidate for every
 * merge: in one day, 68 such merges against 43 pull requests and 67
 * authored commits. The graph became a maze, and most of those merges
 * were thrown away by the next one.
 *
 * A merge queue does the opposite: one candidate at a time is brought up
 * to the integration branch, validated against it and merged; the rest
 * wait untouched. The forge's own merge queue is not available to every
 * repository (a personal account has none), so this is that queue: one
 * definition of the head, used by the job that arms and by the machine
 * that brings candidates forward, so the two can never pick different
 * candidates.
 */
import type { IQueueCandidateFacts } from './queue-order.interface';

export type { IQueueCandidateFacts } from './queue-order.interface';

/**
 * The queue itself: the pull requests this model produced that are ready
 * (not drafts) and not red (they would never merge), oldest first.
 * Conflicting ones keep their place: a conflict confined to derived
 * files is resolved by the machine that brings candidates forward.
 */
export const queueOrder = (
	candidates: readonly IQueueCandidateFacts[],
	publicationPrefix: string,
): readonly IQueueCandidateFacts[] =>
	[...candidates]
		.filter(
			(candidate) =>
				candidate.headRef.startsWith(publicationPrefix) &&
				!candidate.draft &&
				!candidate.red,
		)
		.sort((a, b) => a.number - b.number);

/**
 * The candidate that moves next: the oldest one in the queue that is not
 * conflicting — the forge cannot merge a conflicting one. `undefined`
 * when none is.
 */
export const queueHead = (
	candidates: readonly IQueueCandidateFacts[],
	publicationPrefix: string,
): IQueueCandidateFacts | undefined =>
	queueOrder(candidates, publicationPrefix).find(
		(candidate) => !candidate.conflicting,
	);

import type { IQueueCandidateFacts } from './queue-order.interface';

/** What the queue needs to know about a candidate to say what happens to it. */
export interface ICandidateState extends IQueueCandidateFacts {
	/** The integration branch has commits this candidate does not. */
	readonly behind: boolean;
	/**
	 * Its head is a merge of the integration branch: it was already brought
	 * forward (by the hydrator or its author) and judged against it.
	 */
	readonly headIsIntegrationMerge: boolean;
	/**
	 * Authored files both this candidate and the integration branch changed
	 * since they last met (their merge base). Generated files are left out:
	 * they are regenerated, never merged by hand.
	 */
	readonly overlapping: readonly string[];
}

/**
 * What happens to one open candidate:
 *
 * - `moves-next`: the head of the queue; brought forward, armed, merged.
 * - `refresh-for-overlap`: green, waiting its turn, but the integration
 *   branch changed files it changes too; brought forward now, so a
 *   conflict or a combination that breaks surfaces while it is fresh.
 * - `queued`: green, waiting its turn, and nothing it changes has moved
 *   under it.
 * - `refresh-for-verdict`: red, but judged against an integration branch
 *   that has moved since; brought forward once for a fresh verdict.
 * - `author`: red against the current integration branch, or red again
 *   after being brought forward; nothing moves it until its author pushes.
 * - `draft`: not ready; its author's.
 */
export type ICandidateDisposition =
	| 'moves-next'
	| 'refresh-for-overlap'
	| 'queued'
	| 'refresh-for-verdict'
	| 'author'
	| 'draft';

export interface ICandidateVerdict {
	readonly number: number;
	readonly headRef: string;
	readonly disposition: ICandidateDisposition;
	readonly why: string;
}

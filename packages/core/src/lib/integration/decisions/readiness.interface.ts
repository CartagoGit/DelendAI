/**
 * Contract shapes for `./readiness`: what a pull request's readiness and
 * its disposition are decided from.
 */

/** What the queue needs to know about one candidate to order it. */
export interface IQueueCandidateFacts {
	readonly number: number;
	/** The candidate's branch, without `refs/heads/`. */
	readonly headRef: string;
	readonly draft: boolean;
	/** A required or other check concluded badly on its head. */
	readonly red: boolean;
	/** The checks that concluded badly, by name; empty when not red. */
	readonly failing?: readonly string[];
	/** The forge reports conflicts with the integration branch. */
	readonly conflicting: boolean;
	/** Why the delivery is urgent, from the pull request's body; the queue leads with it. */
	readonly urgent?: string | undefined;
}

/** What the queue needs to know about a candidate to say what happens to it. */
export interface ICandidateState extends IQueueCandidateFacts {
	/** The integration branch has commits this candidate does not. */
	readonly behind: boolean;
	/**
	 * Its head is a merge of the integration branch: it was already brought
	 * forward (by the hydrator or its author) and judged against it.
	 */
	readonly headIsIntegrationMerge: boolean;
	/** Its head is the commit a refresh adds after regenerating. */
	readonly headIsRegeneration: boolean;
	/**
	 * Authored files both this candidate and the integration branch changed
	 * since they last met (their merge base). Generated files are left out:
	 * they are regenerated, never merged by hand.
	 */
	readonly overlapping: readonly string[];
	/**
	 * Its author is gone (finished, idle past the recovery window, out of
	 * quota), with why; absent when the author is there or nobody asked.
	 */
	readonly authorGone?: string | undefined;
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
 * - `regenerate`: red only on checks a regeneration fixes (a stale
 *   derived file), and not regenerated yet; its derived files are
 *   regenerated once.
 * - `author`: red against the current integration branch, or red again
 *   after being brought forward; nothing moves it until its author pushes.
 * - `orphaned`: what would be `author`, but its author is gone; the
 *   hydrator brings it forward, a bounded number of times, and anyone
 *   may adopt it.
 * - `draft`: not ready; its author's.
 */
export type ICandidateDisposition =
	| 'moves-next'
	| 'refresh-for-overlap'
	| 'queued'
	| 'refresh-for-verdict'
	| 'regenerate'
	| 'author'
	| 'orphaned'
	| 'draft';

export interface ICandidateVerdict {
	readonly number: number;
	readonly headRef: string;
	readonly disposition: ICandidateDisposition;
	readonly why: string;
}

/** What decides whether a pull request is ready, read off the forge for its head. */
export interface IPullRequestChecks {
	readonly draft: boolean;
	/** The checks on the head commit, by name. */
	readonly checks: readonly {
		readonly name: string;
		readonly conclusion: string | null;
	}[];
	/** The checks the integration branch requires. */
	readonly required: readonly string[];
	readonly labels: readonly string[];
	/** The labels that keep a pull request out of the queue. */
	readonly blockingLabels: readonly string[];
}

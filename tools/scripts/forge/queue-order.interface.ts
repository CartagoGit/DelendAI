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
}

/**
 * What the queue does about a red integration branch: arm the candidate
 * whose own full run proved it repairs the branch, dispatch that full run
 * for the next candidate that has none, wait for one that is running, or
 * nothing when no candidate can.
 */
export type IRepairStep =
	| { readonly kind: 'arm'; readonly number: number }
	| {
			readonly kind: 'dispatch';
			readonly number: number;
			readonly headRef: string;
	  }
	| { readonly kind: 'wait'; readonly number: number }
	| { readonly kind: 'none' };

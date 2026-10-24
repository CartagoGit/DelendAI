/**
 * review-pack.interface.ts — what one review pack holds of another.
 */

/** Another pack, and what it holds over the integration branch. */
export interface IReviewPackCommits {
	readonly ref: string;
	readonly commits: readonly string[];
}

/** A pack this one carries, and how much of it. */
export interface ICarriedPack {
	readonly ref: string;
	readonly shared: number;
}

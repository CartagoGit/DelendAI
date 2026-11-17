import type { IReviewStatus } from '../../swarm/proposal-review';

/**
 * Furthest first: `released` (on the release branch), `integrated`
 * (approved and on the integration branch), `reviewed` (approved),
 * `changes_requested` and `in_review` (its review-state), `proved`,
 * `implemented` (a delivering commit is recorded), `in-progress`,
 * `pending`; `retired` stands apart.
 */
export type ISliceStage =
	| 'pending'
	| 'in-progress'
	| 'implemented'
	| 'proved'
	| 'in_review'
	| 'changes_requested'
	| 'reviewed'
	| 'integrated'
	| 'released'
	| 'retired';

/** What is recorded about one slice. */
export interface ISliceFacts {
	/** The `Status` word its document carries. */
	readonly status: string;
	readonly reviewState: IReviewStatus;
	/** A delivering commit is recorded (`shipped-in`). */
	readonly delivered: boolean;
	/** Its unit's proof passed. */
	readonly proved: boolean;
	/** Its delivering commit is on the integration branch. */
	readonly integrated: boolean;
	/** Its delivering commit is on the release branch. */
	readonly released: boolean;
}

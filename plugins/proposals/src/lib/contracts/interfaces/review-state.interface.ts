/**
 * review-state.interface.ts — whether a proposal in review waits for a
 * reviewer or has one on it.
 */

/** `review`: waiting for a reviewer. `in-review`: a reviewer is on it. */
export type IReviewState = 'review' | 'in-review';

/** The proposals reviewers are on now, lowercase id → the agents on it. */
export type IReviewersAtWork = ReadonlyMap<string, readonly string[]>;

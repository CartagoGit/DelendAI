/** Types for `./preset-marginal-ceiling`. */

/** One owner's share of a preset's static `tools/list`. */
export interface IOwnerBytes {
	readonly owner: string;
	readonly toolsListBytes: number;
}

/** The most one plugin may contribute to a governed preset. */
export interface IMarginalCeiling {
	readonly hard: number;
	readonly warning: number;
}

/**
 * How the heaviest plugin compares with its ceiling.
 *
 * `no-plugins` is its own answer, never a pass at 0 B: a surface that
 * lists no plugin tools (the adaptive one) has nothing to measure, and
 * saying so is what stops a harness from asserting a ceiling it never
 * exercised.
 */
export type IMarginalVerdict =
	| { readonly kind: 'no-plugins' }
	| {
			readonly kind: 'within' | 'over-warning' | 'over-hard';
			readonly owner: string;
			readonly bytes: number;
			readonly ceiling: IMarginalCeiling;
	  };

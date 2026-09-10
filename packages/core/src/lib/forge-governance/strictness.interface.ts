/**
 * Contract shapes for `./strictness`.
 *
 * Split out of the implementation module so the repo's "types and
 * constants live in contracts" convention holds: `strictness.ts` keeps
 * the behaviour, this file keeps the shapes. Re-exported from
 * `strictness.ts`, so no import site changes.
 */

import {
	BRANCH_PROPERTIES,
	type IBranchProperty,
	type IDesiredBranchRule,
} from './governance-contracts';

/** Why one rule is not at least as strong as another. */
export interface IStrictnessWeakness {
	readonly property: IBranchProperty;
	readonly detail: string;
}

/** Comparison of two branch rules on the protection partial order. */
export interface IStrictnessComparison {
	/** True when every property of `candidate` is >= that of `baseline`. */
	readonly atLeastAsStrong: boolean;
	/** True when `atLeastAsStrong` and at least one property is >. */
	readonly strictlyStronger: boolean;
	/** Properties where `candidate` is weaker than `baseline`. */
	readonly weaknesses: readonly IStrictnessWeakness[];
	/** Properties where `candidate` is strictly stronger. */
	readonly strengthenedProperties: readonly IBranchProperty[];
}

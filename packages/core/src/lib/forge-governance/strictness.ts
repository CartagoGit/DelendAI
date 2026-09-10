/**
 * strictness.ts — a machine-checkable definition of "branch A is at least
 * as protected as branch B".
 *
 * The release branch being stricter than the integration branch is an
 * invariant, not a comment. Without a comparator that invariant can only
 * be asserted field-by-field in a test, which silently stops covering
 * anything the day a new property is added. Ordering every property here
 * means a new field must declare which direction is stronger, and the
 * release-vs-integration test keeps its meaning for free.
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

/**
 * How one property is ordered. Returns -1 = candidate weaker, 0 = equal,
 * 1 = candidate stronger.
 */
type PropertyComparator = (
	candidate: IDesiredBranchRule,
	baseline: IDesiredBranchRule,
) => number;

/** A property whose higher value is the stronger one. */
const ascending =
	(read: (rule: IDesiredBranchRule) => number): PropertyComparator =>
	(candidate, baseline) =>
		Math.sign(read(candidate) - read(baseline));

/**
 * A PERMISSION: granting it is the weaker state, so the order inverts.
 * `allowForcePush: false` is stronger than `allowForcePush: true`.
 */
const descending =
	(read: (rule: IDesiredBranchRule) => number): PropertyComparator =>
	(candidate, baseline) =>
		Math.sign(read(baseline) - read(candidate));

const flag =
	(pick: (rule: IDesiredBranchRule) => boolean) =>
	(rule: IDesiredBranchRule): number =>
		Number(pick(rule));

/**
 * A required check is a SET, not a magnitude: dropping any check the
 * baseline demands is weaker regardless of how many others were added.
 */
const compareRequiredChecks: PropertyComparator = (candidate, baseline) => {
	const candidateChecks = new Set(candidate.requiredChecks);
	const missing = baseline.requiredChecks.filter(
		(check) => !candidateChecks.has(check),
	);
	if (missing.length > 0) return -1;
	return candidate.requiredChecks.length > baseline.requiredChecks.length
		? 1
		: 0;
};

/**
 * The strictness ordering, one entry per property. Typed as a total
 * `Record` over `IBranchProperty` on purpose: adding a property to the
 * contract without declaring which direction is stronger is then a
 * COMPILE error, which is what the old `switch` could only achieve at
 * runtime by returning `undefined`.
 */
const COMPARATORS: Readonly<Record<IBranchProperty, PropertyComparator>> = {
	requiredApprovingReviews: ascending(
		(rule) => rule.requiredApprovingReviews,
	),
	requiredChecks: compareRequiredChecks,
	allowForcePush: descending(flag((rule) => rule.allowForcePush)),
	allowDeletion: descending(flag((rule) => rule.allowDeletion)),
	requirePullRequest: ascending(flag((rule) => rule.requirePullRequest)),
	requireChecksUpToDate: ascending(
		flag((rule) => rule.requireChecksUpToDate),
	),
	requireLinearHistory: ascending(flag((rule) => rule.requireLinearHistory)),
	requireConversationResolution: ascending(
		flag((rule) => rule.requireConversationResolution),
	),
	enforceAdmins: ascending(flag((rule) => rule.enforceAdmins)),
};

/**
 * -1 = candidate weaker, 0 = equal, 1 = candidate stronger, `undefined` =
 * incomparable (a property with no registered ordering).
 */
const compareProperty = (
	property: IBranchProperty,
	candidate: IDesiredBranchRule,
	baseline: IDesiredBranchRule,
): number | undefined => COMPARATORS[property]?.(candidate, baseline);

/**
 * Compare two branch rules. `candidate` is normally the release branch
 * and `baseline` the integration branch.
 */
export const compareStrictness = (
	candidate: IDesiredBranchRule,
	baseline: IDesiredBranchRule,
): IStrictnessComparison => {
	const weaknesses: IStrictnessWeakness[] = [];
	const strengthened: IBranchProperty[] = [];
	for (const property of BRANCH_PROPERTIES) {
		const ordering = compareProperty(property, candidate, baseline);
		if (ordering === undefined) {
			weaknesses.push({
				property,
				detail: `${property} has no defined strictness ordering`,
			});
			continue;
		}
		if (ordering < 0) {
			weaknesses.push({
				property,
				detail: `${candidate.branch} is weaker than ${baseline.branch} on ${property}`,
			});
		} else if (ordering > 0) {
			strengthened.push(property);
		}
	}
	const atLeastAsStrong = weaknesses.length === 0;
	return {
		atLeastAsStrong,
		strictlyStronger: atLeastAsStrong && strengthened.length > 0,
		weaknesses,
		strengthenedProperties: strengthened,
	};
};

/** True when `candidate` is strictly stronger than `baseline`. */
export const isStrictlyStronger = (
	candidate: IDesiredBranchRule,
	baseline: IDesiredBranchRule,
): boolean => compareStrictness(candidate, baseline).strictlyStronger;

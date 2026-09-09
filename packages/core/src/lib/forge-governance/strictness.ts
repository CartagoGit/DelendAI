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
	type BranchProperty,
	type IDesiredBranchRule,
} from './governance-contracts';

/** Why one rule is not at least as strong as another. */
export interface IStrictnessWeakness {
	readonly property: BranchProperty;
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
	readonly strengthenedProperties: readonly BranchProperty[];
}

/** -1 = candidate weaker, 0 = equal, 1 = candidate stronger, undefined = incomparable. */
const compareProperty = (
	property: BranchProperty,
	candidate: IDesiredBranchRule,
	baseline: IDesiredBranchRule,
): number | undefined => {
	switch (property) {
		case 'requiredApprovingReviews':
			return Math.sign(
				candidate.requiredApprovingReviews -
					baseline.requiredApprovingReviews,
			);
		case 'requiredChecks': {
			const candidateChecks = new Set(candidate.requiredChecks);
			const missing = baseline.requiredChecks.filter(
				(check) => !candidateChecks.has(check),
			);
			if (missing.length > 0) return -1;
			return candidate.requiredChecks.length >
				baseline.requiredChecks.length
				? 1
				: 0;
		}
		case 'allowForcePush':
			// Permission properties invert: forbidding is stronger.
			return Math.sign(
				Number(baseline.allowForcePush) -
					Number(candidate.allowForcePush),
			);
		case 'allowDeletion':
			return Math.sign(
				Number(baseline.allowDeletion) -
					Number(candidate.allowDeletion),
			);
		case 'requirePullRequest':
			return Math.sign(
				Number(candidate.requirePullRequest) -
					Number(baseline.requirePullRequest),
			);
		case 'requireChecksUpToDate':
			return Math.sign(
				Number(candidate.requireChecksUpToDate) -
					Number(baseline.requireChecksUpToDate),
			);
		case 'requireLinearHistory':
			return Math.sign(
				Number(candidate.requireLinearHistory) -
					Number(baseline.requireLinearHistory),
			);
		case 'requireConversationResolution':
			return Math.sign(
				Number(candidate.requireConversationResolution) -
					Number(baseline.requireConversationResolution),
			);
		case 'enforceAdmins':
			return Math.sign(
				Number(candidate.enforceAdmins) -
					Number(baseline.enforceAdmins),
			);
		default:
			return undefined;
	}
};

/**
 * Compare two branch rules. `candidate` is normally the release branch
 * and `baseline` the integration branch.
 */
export const compareStrictness = (
	candidate: IDesiredBranchRule,
	baseline: IDesiredBranchRule,
): IStrictnessComparison => {
	const weaknesses: IStrictnessWeakness[] = [];
	const strengthened: BranchProperty[] = [];
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

/**
 * derive-branch-policy.ts — the push policy follows from the
 * development policy, so a project never has to keep the two agreeing
 * by hand.
 *
 * WHY: this repository's config declared `shared-checkout-pr` and, in
 * the same file, told commit-policy to push to `develop`, left
 * `develop` out of its own protected list, and committed whatever was
 * dirty every five minutes. Every one of those was a valid setting.
 * Together they were the opposite of the profile, and the plugin won —
 * because the profile and the plugin were two answers to one question
 * and nothing compared them.
 *
 * Making it agree by hand is not a fix; it is a thing to get wrong
 * again on the next project, and with fifteen agents nobody will notice
 * which of the two is being obeyed. So the integration branch is
 * protected BECAUSE the policy forbids committing to it, whatever the
 * list says, and a config that names it as a push target is refused at
 * boot with the one-line remedy rather than silently fought.
 */

import type { IResolvedDevelopmentPolicy } from '@delendai/core/public';

import type { IDerivedBranchPolicy } from './derive-branch-policy.interface';

export type { IDerivedBranchPolicy } from './derive-branch-policy.interface';

/**
 * The branches this plugin must refuse to move.
 *
 * The configured list is a FLOOR, never the whole answer: a policy that
 * routes work to publication refs makes its integration branch
 * untouchable whether or not anybody remembered to list it.
 */
export const deriveProtectedBranches = (input: {
	readonly configured: readonly string[];
	readonly policy: IResolvedDevelopmentPolicy | undefined;
}): readonly string[] => {
	if (input.policy === undefined) return [...input.configured];
	if (input.policy.persistence.allowsDirectIntegrationCommit) {
		return [...input.configured];
	}
	return [
		...new Set([...input.configured, input.policy.branches.integration]),
	];
};

// `branchPolicyConflicts` and `deriveBranchPolicy` lived here and were
// never called. The detector they implemented now lives in core, as
// `validatePolicyAlignment`, where `assemble.ts` refuses to start
// against it — a rule written and not run is the shape of the bug it
// was meant to catch, and a second implementation of the policy's
// semantics is the bug ITSELF. One of each, in the place that acts on it.

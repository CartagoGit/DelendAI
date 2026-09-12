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

export type {
	IDerivedBranchPolicy,
	IBranchPolicyConflict,
} from './derive-branch-policy.interface';

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

/**
 * Settings that contradict the policy, with what to do about each.
 *
 * Reported rather than silently overridden: a project that wrote
 * `push.branch: "develop"` believes something about how its work lands,
 * and quietly doing the opposite leaves that belief in place to cause
 * the next surprise.
 */
export const branchPolicyConflicts = (input: {
	readonly pushBranch: string | undefined;
	readonly policy: IResolvedDevelopmentPolicy | undefined;
}): IDerivedBranchPolicy['conflicts'] => {
	const policy = input.policy;
	if (policy === undefined) return [];
	if (policy.persistence.allowsDirectIntegrationCommit) return [];
	if (input.pushBranch !== policy.branches.integration) return [];
	return [
		{
			code: 'PUSH_TARGET_CONTRADICTS_POLICY',
			setting: 'plugins.commit-policy.options.push.branch',
			reason: `\`${policy.profile}\` routes work to \`${policy.branches.publicationRefPrefix || 'publication refs'}\` and reaches \`${policy.branches.integration}\` through the forge, but this config names \`${policy.branches.integration}\` as the push target. The push can never succeed, and the setting says the opposite of the profile.`,
			remedy: 'Remove `push.branch`. The development policy decides where work goes; the setting only exists to override a policy that permits it.',
		},
	];
};

/** Both halves at once, which is how a caller wants them. */
export const deriveBranchPolicy = (input: {
	readonly configured: readonly string[];
	readonly pushBranch: string | undefined;
	readonly policy: IResolvedDevelopmentPolicy | undefined;
}): IDerivedBranchPolicy => ({
	protected: deriveProtectedBranches(input),
	conflicts: branchPolicyConflicts(input),
});

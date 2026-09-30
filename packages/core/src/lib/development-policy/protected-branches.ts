/**
 * protected-branches.ts — which branches the resolved policy protects.
 *
 * Every plugin that refuses a push needs the same answer, and it comes
 * from the configured `development` block, never from a branch name the
 * plugin remembers: a project on `trunk`, or one whose only branch is
 * `main`, protects exactly what its own policy says.
 */

import type { IResolvedDevelopmentPolicy } from '../contracts/interfaces/development-policy.interface';
import { UNRESOLVED_POLICY_PROTECTED_BRANCHES } from './default-branch.constant';

export {
	UNRESOLVED_POLICY_PROTECTED_BRANCHES,
	UNRESOLVED_POLICY_RELEASE_BRANCH,
} from './default-branch.constant';

/**
 * The release branch, when it is a branch of its own.
 *
 * A project whose release and integration branches are the same (or that
 * declares no release branch) has no separate release path to guard: its
 * integration branch is governed by the integration rules instead.
 */
export const distinctReleaseBranch = (
	policy: IResolvedDevelopmentPolicy,
): string | undefined => {
	const { release, integration } = policy.branches;
	if (typeof release !== 'string' || release.length === 0) return undefined;
	return release === integration ? undefined : release;
};

/**
 * The protected-branch list a plugin uses when its own configuration
 * names none: the release branch, and the integration branch when the
 * strategy forbids committing to it directly.
 */
export const deriveDefaultProtectedBranches = (
	policy: IResolvedDevelopmentPolicy | undefined,
): readonly string[] => {
	if (policy === undefined) return UNRESOLVED_POLICY_PROTECTED_BRANCHES;
	const protectedBranches: string[] = [];
	const release = distinctReleaseBranch(policy);
	if (release !== undefined) protectedBranches.push(release);
	if (!policy.persistence.allowsDirectIntegrationCommit) {
		protectedBranches.push(policy.branches.integration);
	}
	return protectedBranches;
};

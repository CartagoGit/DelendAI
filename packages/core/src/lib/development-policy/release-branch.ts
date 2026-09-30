/**
 * release-branch.ts — whether a project has a release branch of its own.
 *
 * A project with one branch (`main`) integrates and releases on it. That
 * is a shape, not a mistake: the policy says so by naming the same
 * branch for both roles, or by naming an integration branch and no
 * release branch. Every consumer that would otherwise treat the release
 * branch as a second, stricter boundary asks here first, so the single
 * answer to "is there a release boundary" lives in one place.
 */
import type { IResolvedDevelopmentPolicy } from '../contracts/interfaces/development-policy.interface';

type IBranchPair = Pick<
	IResolvedDevelopmentPolicy['branches'],
	'integration' | 'release'
>;

/** True when releases land on a branch other than the integration branch. */
export const hasSeparateReleaseBranch = (branches: IBranchPair): boolean =>
	branches.release.length > 0 && branches.release !== branches.integration;

/** The branches the policy protects, without repeating a shared one. */
export const protectedBranchNames = (
	branches: IBranchPair,
): readonly string[] => [
	...new Set([branches.integration, branches.release].filter(Boolean)),
];

/**
 * Release-only settings that a project with one branch has declared and
 * that nothing applies. A warning and never a refusal: the project may
 * be keeping them for the day it adds a release branch.
 */
export const singleBranchWarnings = (
	policy: IResolvedDevelopmentPolicy,
): readonly string[] => {
	if (hasSeparateReleaseBranch(policy.branches)) return [];
	const { integration } = policy;
	const warnings: string[] = [];
	if (integration.releaseRequiredApprovals > integration.requiredApprovals) {
		warnings.push(
			`releaseRequiredApprovals (${String(integration.releaseRequiredApprovals)}) is higher than requiredApprovals (${String(integration.requiredApprovals)}), but \`${policy.branches.integration}\` is both the integration and the release branch, so the lower count governs it.`,
		);
	}
	if (integration.releaseRequiredChecks.length > 0) {
		warnings.push(
			`releaseRequiredChecks is set, but \`${policy.branches.integration}\` is both the integration and the release branch, so only requiredChecks are required on it.`,
		);
	}
	return warnings;
};

/** How the branch roles read in a sentence. */
export const describeBranches = (branches: IBranchPair): string =>
	hasSeparateReleaseBranch(branches)
		? `integration branch ${branches.integration}, release branch ${branches.release}`
		: `${branches.integration} is both the integration and the release branch`;

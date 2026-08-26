/**
 * branch.ts — single source of truth for branch protection.
 *
 * x00267 (AUD-CP-009): the previous implementation only enforced
 * branch protection when `sliceContext` was present, so manual,
 * threshold, and interval commits could bypass the `develop` /
 * `main` policy. The unified check below is called from every
 * commit path AND from the push scheduler (x00266).
 */

export interface IBranchPolicy {
	/**
	 * Exact branch names that always refuse (default
	 * `['main', 'master']`). Match is case-sensitive and
	 * whitespace-strict.
	 */
	readonly protected: readonly string[];
	/**
	 * Prefix-based protection — every branch whose name starts
	 * with `<prefix>/` is also refused. Useful for repos that
	 * use long-lived prefix names (`release/2025`, `hotfix/…`).
	 * Defaults to `['release/', 'hotfix/']`.
	 *
	 * `| undefined` because `exactOptionalPropertyTypes` rejects
	 * bare optional fields when callers hold a possibly-undefined
	 * value (which the parsed zod schema does).
	 */
	readonly protectedPrefixes?: readonly string[] | undefined;
}

export const DEFAULT_BRANCH_POLICY: IBranchPolicy = {
	protected: ['main', 'master'],
	protectedPrefixes: ['release/', 'hotfix/'],
};

/**
 * Decide whether `branch` is protected by `policy`. Returns
 * `true` when:
 *   - `branch` is exactly one of `policy.protected`, OR
 *   - `branch` starts with one of `policy.protectedPrefixes`.
 *
 * Always returns `false` when `branch` is undefined (a missing
 * branch is reported as detached HEAD elsewhere — never
 * collapsed into "protected").
 */
export const isBranchProtected = (
	branch: string | undefined,
	policy: IBranchPolicy,
): boolean => {
	if (branch === undefined) return false;
	if (policy.protected.includes(branch)) return true;
	const prefixes = policy.protectedPrefixes ?? [];
	for (const prefix of prefixes) {
		if (branch.startsWith(prefix)) return true;
	}
	return false;
};

/**
 * Refusal string for the unified path. Always carries the
 * branch name and the policy source so log triage can spot
 * drift between configured and applied lists.
 */
export const branchProtectedRefusal = (
	branch: string,
	policy: IBranchPolicy,
): string =>
	`BRANCH_PROTECTED: branch "${branch}" matches policy (exact=${policy.protected.join(',')}, prefixes=${(policy.protectedPrefixes ?? []).join(',')})`;

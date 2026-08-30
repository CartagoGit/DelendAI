/**
 * protected-branches.ts — c00145 (Track A.default).
 *
 * Canonical default for `commit-policy.protectedBranches`:
 *
 *   DEFAULT_PROTECTED_BRANCHES  = ['main', 'master']   — always protected.
 *   OPTIONAL_PROTECTED_BRANCHES = ['develop', /^release\//] — only when the
 *     owner opts in explicitly.
 *   NEVER_PROTECTED_BRANCHES    = [/^agent\//, /^worktree\//] — never
 *     protected (agent/worktree isolation).
 *
 * This REVERSES the default introduced by c00131 (`develop` was included),
 * following the external reviewer's retraction: `develop` must stay
 * flexible for the human workflow unless the owner explicitly opts in.
 */

/** Branches that are always protected by default. */
export const DEFAULT_PROTECTED_BRANCHES: readonly string[] = ['main', 'master'];

/** Branches the owner can explicitly add if they want main-equivalent protection. */
export const OPTIONAL_PROTECTED_BRANCHES: readonly string[] = ['develop'];

/** Branch patterns never protected by default (nor by opt-in). */
export const NEVER_PROTECTED_BRANCH_PATTERNS: readonly RegExp[] = [
	/^agent\//,
	/^worktree\//,
];

/** True when the branch name matches a never-protected pattern. */
export const isNeverProtected = (branch: string): boolean =>
	NEVER_PROTECTED_BRANCH_PATTERNS.some((pattern) => pattern.test(branch));

/**
 * Resolve the effective protected-branch list for the push driver.
 *
 * - Explicit config wins and REPLACES the default (no implicit merge),
 *   matching the commit-policy config contract.
 * - Never-protected patterns are filtered out defensively (agent/worktree
 *   branches cannot be locked accidentally).
 */
export const resolveProtectedBranches = (
	explicit: readonly string[] | undefined,
): readonly string[] => {
	const source = explicit ?? DEFAULT_PROTECTED_BRANCHES;
	const set = new Set<string>();
	for (const branch of source) {
		if (isNeverProtected(branch)) continue;
		set.add(branch);
	}
	return [...set];
};

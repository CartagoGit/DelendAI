/**
 * protected-branches.ts — c00145 (Track A.default).
 *
 * No branch name is protected by default. The configured list is authoritative
 * so the plugin remains usable in repositories with any branch naming scheme.
 */

export const DEFAULT_PROTECTED_BRANCHES: readonly string[] = [];

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

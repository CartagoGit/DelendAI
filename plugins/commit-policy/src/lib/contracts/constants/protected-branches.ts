/**
 * protected-branches.ts — c00145 (Track A.default).
 *
 * The v2 default protects `main` explicitly and carries `release/*`
 * as a serialized regexp token because downstream contracts expose
 * protected branches as strings.
 */

export const DEFAULT_RELEASE_PATTERN = /^release\//;

/** @deprecated Use DEFAULT_PROTECTED_BRANCHES_V2. Kept for compatibility. */
export const DEFAULT_PROTECTED_BRANCHES: readonly string[] = [];

export const DEFAULT_PROTECTED_BRANCHES_V2: readonly string[] = ['main'];

export const DEFAULT_PROTECTED_BRANCH_PATTERNS: readonly RegExp[] = [
	DEFAULT_RELEASE_PATTERN,
];

/** Branch patterns never protected by default (nor by opt-in). */
export const NEVER_PROTECTED_BRANCH_PATTERNS: readonly RegExp[] = [
	/^agent\//,
	/^worktree\//,
];

/** True when the branch name matches a never-protected pattern. */
export const isNeverProtected = (branch: string): boolean =>
	NEVER_PROTECTED_BRANCH_PATTERNS.some((pattern) => pattern.test(branch));

const samePattern = (left: RegExp, right: RegExp): boolean =>
	left.source === right.source && left.flags === right.flags;

const isNeverProtectedPattern = (pattern: RegExp): boolean =>
	NEVER_PROTECTED_BRANCH_PATTERNS.some((neverPattern) =>
		samePattern(neverPattern, pattern),
	);

const serializeProtectedBranchPattern = (pattern: RegExp): string =>
	pattern.toString();

/**
 * Resolve the effective protected-branch list for the push driver.
 *
 * - Explicit config is merged with the v2 default literal branches.
 * - RegExp patterns are serialized with `RegExp#toString()` because the
 *   public contract returns strings, not matcher objects.
 * - Never-protected patterns are filtered out defensively (agent/worktree
 *   branches cannot be locked accidentally).
 */
export const resolveProtectedBranches = (
	explicit: readonly string[] | undefined,
	patterns: readonly RegExp[] = DEFAULT_PROTECTED_BRANCH_PATTERNS,
): readonly string[] => {
	const source = explicit ?? DEFAULT_PROTECTED_BRANCHES_V2;
	const set = new Set<string>();
	for (const branch of source) {
		if (isNeverProtected(branch)) continue;
		set.add(branch);
	}
	for (const pattern of patterns) {
		if (isNeverProtectedPattern(pattern)) continue;
		set.add(serializeProtectedBranchPattern(pattern));
	}
	return [...set];
};

export const resolveProtectedBranchesV2 = resolveProtectedBranches;

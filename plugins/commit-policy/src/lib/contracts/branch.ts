/**
 * branch.ts — single source of truth for branch protection.
 *
 * Branch protection is entirely supplied by the commit-policy push config.
 * An empty policy protects no branch.
 */

export interface IBranchPolicy {
	/**
	 * Exact branch names that always refuse. Match is case-sensitive and
	 * whitespace-strict.
	 */
	readonly protected: readonly string[];
	/**
	 * Prefix-based protection — every branch whose name starts
	 * with `<prefix>/` is also refused. Useful for repos that
	 * use long-lived prefix names (`release/2025`, `hotfix/…`).
	 * An empty list means no prefix-based protection.
	 *
	 * `| undefined` because `exactOptionalPropertyTypes` rejects
	 * bare optional fields when callers hold a possibly-undefined
	 * value (which the parsed zod schema does).
	 */
	readonly protectedPrefixes?: readonly string[] | undefined;
}

export const BRANCH_PROTECTED_REFUSAL_CODE = 'BRANCH_PROTECTED';

export const COMMIT_POLICY_REFUSAL_CODES = [
	'COMMIT_DISABLED',
	'IDENTITY_UNRESOLVED',
	'DETACHED_HEAD',
	'BRANCH_PROTECTED',
	'NON_CONVENTIONAL_MESSAGE',
	'SLICE_HAS_NO_FILES',
	'WORKSPACE_HAS_NO_FILES',
	'TRIGGER_HAS_NO_FILES',
	'CROSS_AGENT_CONTAMINATION',
	'CAUSALITY_VIOLATION',
	'NOTHING_TO_COMMIT',
	'GIT_OPERATION_FAILED',
	'PUSH_DISABLED',
	'PUSH_TARGET_UNRESOLVED',
	'PUSH_REMOTE_UNRESOLVED',
	'FORCE_AUTHORIZATION_REQUIRED',
	'DIRECT_PUSH_TO_MAIN_NOT_ALLOWED',
	'PUSH_FAILED',
	'UNKNOWN_REFUSAL',
] as const;

export type CommitPolicyRefusalCode =
	(typeof COMMIT_POLICY_REFUSAL_CODES)[number];

export const classifyRefusal = (refusal: string): CommitPolicyRefusalCode => {
	if (refusal.includes('commit.enabled')) return 'COMMIT_DISABLED';
	if (refusal.includes('identity.mode')) return 'IDENTITY_UNRESOLVED';
	if (refusal.includes('HEAD is detached')) return 'DETACHED_HEAD';
	if (refusal.includes(BRANCH_PROTECTED_REFUSAL_CODE))
		return 'BRANCH_PROTECTED';
	if (refusal.includes('NON_CONVENTIONAL_MESSAGE'))
		return 'NON_CONVENTIONAL_MESSAGE';
	if (refusal.includes('SLICE_HAS_NO_FILES')) return 'SLICE_HAS_NO_FILES';
	if (refusal.includes('WORKSPACE_HAS_NO_FILES'))
		return 'WORKSPACE_HAS_NO_FILES';
	if (refusal.includes('TRIGGER_HAS_NO_FILES')) return 'TRIGGER_HAS_NO_FILES';
	if (refusal.includes('CROSS_AGENT_CONTAMINATION'))
		return 'CROSS_AGENT_CONTAMINATION';
	if (refusal.includes('CAUSALITY_VIOLATION')) return 'CAUSALITY_VIOLATION';
	if (refusal.includes('nothing to commit')) return 'NOTHING_TO_COMMIT';
	if (refusal.includes('push.enabled')) return 'PUSH_DISABLED';
	if (refusal.includes('could not resolve remote/branch'))
		return 'PUSH_TARGET_UNRESOLVED';
	if (refusal.includes('could not resolve remote'))
		return 'PUSH_REMOTE_UNRESOLVED';
	if (refusal.includes('forceReason') || refusal.includes('plain --force'))
		return 'FORCE_AUTHORIZATION_REQUIRED';
	if (refusal.includes("direct push to 'main' is not allowed"))
		return 'DIRECT_PUSH_TO_MAIN_NOT_ALLOWED';
	if (refusal.startsWith('push failed:')) return 'PUSH_FAILED';
	if (refusal.startsWith('git ')) return 'GIT_OPERATION_FAILED';
	return 'UNKNOWN_REFUSAL';
};

export const DEFAULT_BRANCH_POLICY: IBranchPolicy = {
	protected: [],
	protectedPrefixes: [],
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
	`${BRANCH_PROTECTED_REFUSAL_CODE}: branch "${branch}" matches policy (exact=${policy.protected.join(',')}, prefixes=${(policy.protectedPrefixes ?? []).join(',')})`;

export const refusalHasCode = (refusal: string, code: string): boolean =>
	refusal.startsWith(`${code}:`);

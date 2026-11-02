/**
 * Constants for `./governance-contracts`.
 *
 * Split out of the implementation module so the repo's "types and
 * constants live in contracts" convention holds: `governance-contracts.ts` keeps
 * the behaviour, this file keeps the constants. Re-exported from
 * `governance-contracts.ts`, so no import site changes.
 */

/**
 * The only three outcomes a governance property may have.
 *
 * - `PASS` — the live value was READ and it matches the desired value.
 * - `FAIL` — the live value was READ and it does not match.
 * - `NOT_EXECUTABLE` — the live value could NOT be read (no credential,
 *   API error, unsupported provider, property not reported). This is
 *   never a pass; consumers must treat it as a failure unless the
 *   property is explicitly declared not-applicable for the policy.
 */
export const GOVERNANCE_STATUSES = ['PASS', 'FAIL', 'NOT_EXECUTABLE'] as const;

/** Forge vendors this broker can have an adapter for. */
export const FORGE_PROVIDERS = ['github', 'gitlab'] as const;

/** Branch-scoped properties, in a fixed order so diffs are stable. */
export const BRANCH_PROPERTIES = [
	'requirePullRequest',
	'requiredApprovingReviews',
	'requiredChecks',
	'requireChecksUpToDate',
	'requireLinearHistory',
	'allowForcePush',
	'allowDeletion',
	'requireConversationResolution',
	'enforceAdmins',
] as const;

/** Repository-scoped properties, in a fixed order. */
export const REPOSITORY_PROPERTIES = [
	'allowSquashMerge',
	'allowMergeCommit',
	'allowRebaseMerge',
	'deleteBranchOnMerge',
] as const;

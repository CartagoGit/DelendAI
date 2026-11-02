/**
 * github-payloads.ts — builds the exact request bodies the GitHub adapter
 * sends, and nothing else.
 *
 * Keeping payload construction pure and separate is what makes the write
 * path reviewable: you can read this file and see the complete set of
 * fields governance is ever allowed to change, with no branch on ambient
 * state and no place for a caller-supplied fragment to be merged in. That
 * is the structural reason the broker has no `request(anything)` escape
 * hatch — there is simply no code path that builds a body from anything
 * but an `IDesiredBranchRule` or `IDesiredRepositorySettings`.
 *
 * `restrictions: null` is deliberate: governance decides HOW a branch is
 * protected, never WHO may push to it. Actor allow-lists stay a human
 * decision, and silently clearing one would be a surprise.
 */

import type {
	IDesiredBranchRule,
	IDesiredRepositorySettings,
} from './governance-contracts';

/** The JSON body for `PUT …/branches/{branch}/protection`. */
export const branchProtectionPayload = (
	rule: IDesiredBranchRule,
): Readonly<Record<string, unknown>> => ({
	required_status_checks:
		rule.requiredChecks.length > 0
			? {
					strict: rule.requireChecksUpToDate,
					contexts: [...rule.requiredChecks],
				}
			: null,
	enforce_admins: rule.enforceAdmins,
	required_pull_request_reviews: rule.requirePullRequest
		? {
				required_approving_review_count: rule.requiredApprovingReviews,
				dismiss_stale_reviews: true,
				require_code_owner_reviews: false,
			}
		: null,
	restrictions: null,
	required_linear_history: rule.requireLinearHistory,
	allow_force_pushes: rule.allowForcePush,
	allow_deletions: rule.allowDeletion,
	required_conversation_resolution: rule.requireConversationResolution,
});

/** The JSON body for `PATCH /repos/{owner}/{repo}`. */
export const repositorySettingsPayload = (
	settings: IDesiredRepositorySettings,
): Readonly<Record<string, unknown>> => ({
	allow_squash_merge: settings.allowSquashMerge,
	allow_merge_commit: settings.allowMergeCommit,
	allow_rebase_merge: settings.allowRebaseMerge,
	delete_branch_on_merge: settings.deleteBranchOnMerge,
});

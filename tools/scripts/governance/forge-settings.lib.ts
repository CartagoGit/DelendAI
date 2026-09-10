/**
 * forge-settings.lib.ts — projects the canonical development policy onto
 * the committed forge-governance files.
 *
 * Before this existed, five places answered "how is `develop` protected",
 * and they disagreed: `.github/settings.yml` declared it protected with
 * `delendai-validate`; `.github/branch-protection.yml` declared it
 * `protected: false`; the live repository had no protection at all; the
 * branch-protection guard hardcoded the branch name and check list; and
 * `main` required a `ci-complete` context that no workflow produces, so
 * it could never merge.
 *
 * The fix is not to reconcile five editable files by hand. It is to make
 * four of them derived: the policy in `delendai.config.json` is the
 * source, these documents are its projection, and CI fails when the
 * committed projection no longer matches what the policy would generate.
 *
 * This module is PURE — policy in, document objects out. The script that
 * writes or checks them owns the I/O.
 */

import type { IResolvedDevelopmentPolicy } from '@delendai/core/public';

/** One branch's protection, in the shape the committed files already use. */
export interface IProtectionDocument {
	readonly required_status_checks: {
		readonly strict: boolean;
		readonly contexts: readonly string[];
	};
	/**
	 * `null` when the branch accepts a direct push. Present — with the
	 * approval count — when the policy integrates through pull requests.
	 *
	 * This is the property the two committed files disagreed about while
	 * the live repository did a third thing, so it is projected rather
	 * than hand-written: a reviewer can see that PR-required follows from
	 * `integration.strategy`, and cannot drift from it by editing YAML.
	 */
	readonly required_pull_request_reviews: {
		readonly required_approving_review_count: number;
	} | null;
	readonly enforce_admins: boolean;
	readonly required_linear_history: boolean;
	readonly allow_force_pushes: boolean;
	readonly allow_deletions: boolean;
	readonly restrictions: null;
}

export interface IBranchDocument {
	readonly name: string;
	/**
	 * Present only when the branch is deliberately unprotected. Kept
	 * because `branch-protection.yml` already used it to say so out loud,
	 * which is better than an absent entry that could mean "unprotected"
	 * or "nobody wrote this down yet".
	 */
	readonly protected?: boolean;
	readonly protection: IProtectionDocument;
}

/**
 * A branch nobody protects still gets an explicit document, so the file
 * distinguishes "deliberately open" from "not described".
 */
const unprotected = (name: string): IBranchDocument => ({
	name,
	protected: false,
	protection: {
		required_status_checks: { strict: false, contexts: [] },
		required_pull_request_reviews: null,
		enforce_admins: false,
		required_linear_history: false,
		allow_force_pushes: false,
		allow_deletions: false,
		restrictions: null,
	},
});

/**
 * The integration branch. A `direct` policy deliberately produces a
 * DIFFERENT document than a `pull-request` one — applying pull-request
 * rules to a project that chose direct integration would break it.
 */
export const integrationBranchDocument = (
	policy: IResolvedDevelopmentPolicy,
): IBranchDocument => {
	const { integration, branches } = policy;
	if (!integration.requiresPullRequest)
		return unprotected(branches.integration);

	return {
		name: branches.integration,
		protection: {
			required_status_checks: {
				strict: integration.requireLatestIntegration,
				contexts: [...integration.requiredChecks],
			},
			required_pull_request_reviews: {
				required_approving_review_count: integration.requiredApprovals,
			},
			enforce_admins: true,
			required_linear_history: integration.linearHistory,
			allow_force_pushes: integration.allowForcePush,
			allow_deletions: integration.allowDeleteIntegrationBranch,
			restrictions: null,
		},
	};
};

/**
 * The release branch is always at least as strict as the integration
 * branch: it is the boundary a project promotes across, and a release
 * that is easier to land than a merge would invert the whole point.
 */
export const releaseBranchDocument = (
	policy: IResolvedDevelopmentPolicy,
): IBranchDocument => ({
	name: policy.branches.release,
	protection: {
		required_status_checks: {
			strict: true,
			// A release boundary may run gates a day-to-day merge does
			// not; an empty list means "the same as integration".
			contexts: [
				...(policy.integration.releaseRequiredChecks.length > 0
					? policy.integration.releaseRequiredChecks
					: policy.integration.requiredChecks),
			],
		},
		required_pull_request_reviews: {
			required_approving_review_count:
				policy.integration.releaseRequiredApprovals,
		},
		enforce_admins: true,
		required_linear_history: true,
		allow_force_pushes: false,
		allow_deletions: false,
		restrictions: null,
	},
});

/** `.github/settings.yml` — the integration branch's declaration. */
export const settingsDocument = (
	policy: IResolvedDevelopmentPolicy,
): { readonly branches: readonly IBranchDocument[] } => ({
	branches: [integrationBranchDocument(policy)],
});

/** `.github/branch-protection.yml` — both branches, release first. */
export const branchProtectionDocument = (
	policy: IResolvedDevelopmentPolicy,
): {
	readonly version: number;
	readonly branches: readonly IBranchDocument[];
} => ({
	version: 1,
	branches: [
		releaseBranchDocument(policy),
		integrationBranchDocument(policy),
	],
});

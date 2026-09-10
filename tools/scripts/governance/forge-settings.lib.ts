/**
 * forge-settings.lib.ts — renders the committed forge-governance files
 * from the SAME desired state the runtime broker compares against.
 *
 * Before this existed, five places answered "how is `develop` protected",
 * and they disagreed: `.github/settings.yml` declared it protected with
 * `delendai-validate`; `.github/branch-protection.yml` declared it
 * `protected: false`; the live repository had no protection at all; the
 * branch-protection guard hardcoded the branch name and check list; and
 * `main` required a `ci-complete` context that no workflow produces, so
 * it could never merge.
 *
 * The first version of this file fixed four of those by projecting the
 * policy — and quietly became a SIXTH answer, because it re-derived the
 * rules itself instead of asking `buildDesiredState`. That is not
 * hypothetical: the two producers disagreed about `enforceAdmins` on the
 * integration branch, so the committed YAML said one thing while the
 * boot-time reconciler reported drift against the other. A drift check
 * that can pass while the broker reports drift is worse than no check.
 *
 * So the derivation lives in exactly ONE place — `buildDesiredState` in
 * `@delendai/core` — and this module is only a RENDERER: desired rules
 * in, YAML-shaped documents out. A rule the broker adds shows up here for
 * free, and a rule the two disagree about is no longer expressible.
 */

import {
	buildDesiredState,
	type IDesiredBranchRule,
	type IResolvedDevelopmentPolicy,
} from '@delendai/core/public';

/** One branch's protection, in the shape the committed files already use. */
export interface IProtectionDocument {
	readonly required_status_checks: {
		readonly strict: boolean;
		readonly contexts: readonly string[];
	};
	/**
	 * `null` when the branch accepts a direct push. Present — with the
	 * approval count — when the policy integrates through pull requests.
	 * This is the property the two committed files disagreed about while
	 * the live repository did a third thing.
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
 * "Deliberately open": the desired state asks for no pull request and no
 * checks, so there is nothing for the forge to enforce. Saying that out
 * loud beats an entry a reader has to interpret.
 */
const isOpen = (rule: IDesiredBranchRule): boolean =>
	!rule.requirePullRequest && rule.requiredChecks.length === 0;

/** Render one desired rule. The ONLY place field names are translated. */
export const renderBranchDocument = (
	rule: IDesiredBranchRule,
): IBranchDocument => {
	const protection: IProtectionDocument = {
		required_status_checks: {
			strict: rule.requireChecksUpToDate,
			contexts: [...rule.requiredChecks],
		},
		required_pull_request_reviews: rule.requirePullRequest
			? {
					required_approving_review_count:
						rule.requiredApprovingReviews,
				}
			: null,
		enforce_admins: rule.enforceAdmins,
		required_linear_history: rule.requireLinearHistory,
		allow_force_pushes: rule.allowForcePush,
		allow_deletions: rule.allowDeletion,
		restrictions: null,
	};
	return isOpen(rule)
		? { name: rule.branch, protected: false, protection }
		: { name: rule.branch, protection };
};

const ruleFor = (
	policy: IResolvedDevelopmentPolicy,
	role: 'integration' | 'release',
): IDesiredBranchRule => {
	const found = buildDesiredState(policy).branches.find(
		(rule) => rule.role === role,
	);
	if (found === undefined) {
		throw new Error(
			`forge-settings: the desired state describes no ${role} branch, so there is nothing to render.`,
		);
	}
	return found;
};

/**
 * The integration branch. A `direct` policy deliberately produces a
 * DIFFERENT document than a `pull-request` one — applying pull-request
 * rules to a project that chose direct integration would break it.
 */
export const integrationBranchDocument = (
	policy: IResolvedDevelopmentPolicy,
): IBranchDocument => renderBranchDocument(ruleFor(policy, 'integration'));

/**
 * The release branch is always at least as strict as the integration
 * branch: it is the boundary a project promotes across, and a release
 * that is easier to land than a merge would invert the whole point.
 * `buildDesiredState` owns that invariant; this only renders it.
 */
export const releaseBranchDocument = (
	policy: IResolvedDevelopmentPolicy,
): IBranchDocument => renderBranchDocument(ruleFor(policy, 'release'));

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

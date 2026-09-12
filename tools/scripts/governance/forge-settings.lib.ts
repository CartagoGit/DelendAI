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

/**
 * `.github/branch-protection.ts` — the TYPED declaration the CI verifiers
 * (`verify-develop-health`, `verify-branch-protection`) read.
 *
 * It is rendered rather than hand-written for the reason this whole
 * module exists: it was a THIRD independent answer to "how is develop
 * protected", and it still said `protected: false` with no checks while
 * `main` required the `ci-complete` context no workflow produces. Both
 * verifiers therefore reported the freshly-protected `develop` as drift
 * and the correct `main` as wrong.
 *
 * Its `defaults` block is deliberately taken from the RELEASE rule: it
 * is the branch this repository holds to the strictest shape, and the
 * per-branch entries below carry whatever differs.
 */
export const branchProtectionModule = (
	policy: IResolvedDevelopmentPolicy,
): string => {
	const release = ruleFor(policy, 'release');
	const integration = ruleFor(policy, 'integration');
	const entry = (rule: IDesiredBranchRule, why: string): string =>
		[
			'\t\t{',
			`\t\t\t// ${why}`,
			`\t\t\tname: '${rule.branch}',`,
			`\t\t\tprotected: ${String(rule.requirePullRequest || rule.requiredChecks.length > 0)},`,
			`\t\t\trequired_checks: [${rule.requiredChecks.map((check) => `'${check}'`).join(', ')}],`,
			'\t\t},',
		].join('\n');

	return `${[
		'// GENERATED — do not edit.',
		'//',
		'// Projection of the canonical development policy in',
		'// `delendai.config.json`. Change the policy, then run:',
		'//   bun tools/scripts/governance/forge-settings.script.ts --write',
		'',
		'/** Global shape every protected branch is held to. */',
		'export interface IBranchProtectionDefaults {',
		'\treadonly enforce_admins: boolean;',
		'\treadonly required_linear_history: boolean;',
		'\treadonly allow_force_pushes: boolean;',
		'\treadonly allow_deletions: boolean;',
		'}',
		'',
		'/** One branch, and the checks it requires. */',
		'export interface IBranchPolicy {',
		'\treadonly name: string;',
		'\treadonly protected: boolean;',
		'\treadonly required_checks: readonly string[];',
		'}',
		'',
		'export interface IBranchProtectionConfig {',
		'\treadonly version: number;',
		'\treadonly defaults: IBranchProtectionDefaults;',
		'\treadonly branches: readonly IBranchPolicy[];',
		'}',
		'',
		'export const BRANCH_PROTECTION: IBranchProtectionConfig = {',
		'\tversion: 1,',
		'\tdefaults: {',
		`\t\tenforce_admins: ${String(release.enforceAdmins)},`,
		`\t\trequired_linear_history: ${String(release.requireLinearHistory)},`,
		`\t\tallow_force_pushes: ${String(release.allowForcePush)},`,
		`\t\tallow_deletions: ${String(release.allowDeletion)},`,
		'\t},',
		'\tbranches: [',
		entry(
			integration,
			'The integration branch: where certified work lands.',
		),
		entry(release, 'The release branch: the promotion boundary.'),
		'\t],',
		'};',
	].join('\n')}\n`;
};

/**
 * The forge ruleset that makes a wrong branch name impossible, rather
 * than merely reported.
 *
 * WHY a ruleset and not a lint: `lint:ref-lifecycle` classifies refs
 * AFTER they exist. That is the right tool for "this ref has no pull
 * request any more", and the wrong one for "this ref should never have
 * been created" — by the time it speaks, the branch is in the
 * repository, in everybody's `git fetch`, and in the operator's history
 * view. Twice now branches appeared under `agent/*` and `wip/*` with the
 * guard sitting right there, because a report is not a refusal.
 *
 * A `creation` rule over every ref EXCEPT the allowed namespaces is
 * server-side and unbypassable: the push is declined by the forge before
 * the ref exists. Verified in both directions — `feat/x` is rejected,
 * `delendai/pr/x` is accepted.
 *
 * WHY it is derived here rather than clicked into the settings UI: a
 * rule nobody can read from the repository is a rule that drifts, which
 * is the whole finding of ADR 0020. The namespaces come from the policy
 * — `publicationRefPrefix` for what may carry a pull request, and
 * `foreignRefPrefixes` for the automation delendai does not own — so
 * changing the policy changes the rule, and `--check` catches a forge
 * that stopped matching.
 *
 * The integration and release branches are excluded because they already
 * exist and are governed by branch protection; a `creation` rule would
 * only ever fire on somebody re-creating a deleted one.
 */
export const namespaceRuleset = (
	policy: IResolvedDevelopmentPolicy,
): Readonly<Record<string, unknown>> => {
	const allowed = [
		`refs/heads/${policy.branches.integration}`,
		`refs/heads/${policy.branches.release}`,
		...(policy.branches.publicationRefPrefix === ''
			? []
			: [`refs/heads/${policy.branches.publicationRefPrefix}**`]),
		...policy.branches.foreignRefPrefixes.map(
			(prefix) => `refs/heads/${prefix}**`,
		),
	];
	return {
		name: 'branch-namespace',
		target: 'branch',
		enforcement: 'active',
		conditions: { ref_name: { include: ['~ALL'], exclude: allowed } },
		rules: [{ type: 'creation' }],
	};
};

/**
 * build-desired-state.spec.ts — pins the property that makes forge
 * governance trustworthy: the desired forge configuration is a pure
 * function of the development policy.
 *
 * Each profile is checked for the shape it asked for, not for a shape
 * this repository happens to have. A project that chooses `direct` must
 * NOT be handed pull-request rules, `worktree-pr` must produce a real
 * desired state even though it is not the profile this repo runs, and the
 * release branch must be provably stronger than the integration branch
 * under every profile.
 */
import { describe, expect, it } from 'vitest';

import { expandProfile } from '@delendai/core/lib/development-policy/profiles';
import {
	branchPropertyId,
	buildDesiredState,
	compareStrictness,
	findBranchRule,
	isStrictlyStronger,
} from '@delendai/core/lib/forge-governance/index';

const rule = (
	profile: 'shared-direct' | 'shared-checkout-pr' | 'worktree-pr',
	branch: string,
) => {
	const desired = buildDesiredState(expandProfile(profile));
	const found = findBranchRule(desired, branch);
	if (found === undefined) throw new Error(`no rule for ${branch}`);
	return found;
};

describe('buildDesiredState — pull-request profiles', () => {
	it('shared-checkout-pr requires a PR, the policy checks and the up-to-date gate', () => {
		const policy = expandProfile('shared-checkout-pr');
		const desired = buildDesiredState(policy);
		const integration = rule('shared-checkout-pr', 'develop');

		expect(desired.integrationStrategy).toBe('pull-request');
		expect(integration.requirePullRequest).toBe(true);
		expect(integration.requiredChecks).toEqual(
			policy.integration.requiredChecks,
		);
		expect(integration.requireChecksUpToDate).toBe(true);
		expect(integration.requireLinearHistory).toBe(true);
		expect(integration.allowForcePush).toBe(false);
		expect(integration.allowDeletion).toBe(false);
		expect(desired.repository.deleteBranchOnMerge).toBe(true);
		expect(desired.repository.allowSquashMerge).toBe(true);
		expect(desired.repository.allowMergeCommit).toBe(false);
	});

	it('worktree-pr also produces a desired state (governance derives from policy, not repo name)', () => {
		const desired = buildDesiredState(expandProfile('worktree-pr'));
		const integration = rule('worktree-pr', 'develop');

		expect(desired.policyProfile).toBe('worktree-pr');
		expect(desired.integrationStrategy).toBe('pull-request');
		expect(integration.requirePullRequest).toBe(true);
		// No profile invents a check name (aabad2cd): a profile cannot
		// know what this project's CI calls its contexts, and a plausible
		// guess locks the branch against a context no workflow produces.
		expect(integration.requiredChecks).toEqual([]);
		expect(integration.requireChecksUpToDate).toBe(true);
		expect(desired.branches.map((branch) => branch.branch)).toEqual([
			'develop',
			'main',
		]);
	});

	it('is pure — the same policy always yields the same state', () => {
		expect(buildDesiredState(expandProfile('worktree-pr'))).toEqual(
			buildDesiredState(expandProfile('worktree-pr')),
		);
	});
});

describe('buildDesiredState — direct integration', () => {
	it('shared-direct derives a different, compatible state that does NOT require pull requests', () => {
		const desired = buildDesiredState(expandProfile('shared-direct'));
		const integration = rule('shared-direct', 'develop');

		expect(desired.integrationStrategy).toBe('direct');
		expect(integration.requirePullRequest).toBe(false);
		expect(integration.requiredChecks).toEqual([]);
		expect(integration.requireChecksUpToDate).toBe(false);
		// Still compatible: the branch keeps the guarantees the policy asked for.
		expect(integration.requireLinearHistory).toBe(true);
		expect(integration.allowForcePush).toBe(false);
		expect(integration.allowDeletion).toBe(false);
	});

	it('differs from the pull-request state for the same branch', () => {
		expect(rule('shared-direct', 'develop')).not.toEqual(
			rule('shared-checkout-pr', 'develop'),
		);
	});

	it('declares the check properties not-applicable rather than silently passing them', () => {
		const desired = buildDesiredState(expandProfile('shared-direct'));

		expect(desired.notApplicable).toContain(
			branchPropertyId('develop', 'requiredChecks'),
		);
		expect(desired.notApplicable).toContain(
			branchPropertyId('develop', 'requireChecksUpToDate'),
		);
	});
});

describe('the release branch is strictly stronger than integration', () => {
	it.each(['shared-direct', 'shared-checkout-pr', 'worktree-pr'] as const)(
		'%s',
		(profile) => {
			const integration = rule(profile, 'develop');
			const release = rule(profile, 'main');
			const comparison = compareStrictness(release, integration);

			expect(comparison.weaknesses).toEqual([]);
			expect(comparison.atLeastAsStrong).toBe(true);
			expect(isStrictlyStronger(release, integration)).toBe(true);
			// …and not stronger in both directions.
			expect(isStrictlyStronger(integration, release)).toBe(false);
			expect(release.role).toBe('release');
			expect(release.enforceAdmins).toBe(true);
			expect(release.requirePullRequest).toBe(true);
		},
	);
});

/**
 * The approval count is a policy decision, not a forge fact. Hardcoding
 * "the release branch needs one human" made the broker report a permanent
 * FAIL against a repository that had deliberately chosen autonomous
 * integration on green CI — a correct configuration the gate could never
 * be satisfied by.
 */
describe('required approvals come from policy, not from a constant', () => {
	it('defaults to zero on every branch so autonomous integration is representable', () => {
		for (const profile of [
			'shared-direct',
			'shared-checkout-pr',
			'worktree-pr',
		] as const) {
			const desired = buildDesiredState(expandProfile(profile));

			expect(desired.approvals).toEqual({ integration: 0, release: 0 });
			for (const rule of desired.branches) {
				expect(rule.requiredApprovingReviews).toBe(0);
			}
		}
	});

	it('honours an explicit approval requirement', () => {
		const desired = buildDesiredState(expandProfile('worktree-pr'), {
			approvals: { integration: 1, release: 2 },
		});

		expect(
			findBranchRule(desired, 'develop')?.requiredApprovingReviews,
		).toBe(1);
		expect(findBranchRule(desired, 'main')?.requiredApprovingReviews).toBe(
			2,
		);
	});

	it('never lets the release branch ask for fewer approvals than integration', () => {
		const desired = buildDesiredState(expandProfile('worktree-pr'), {
			approvals: { integration: 2, release: 0 },
		});

		expect(desired.approvals.release).toBe(2);
	});

	it('keeps the release branch strictly stronger with zero approvals everywhere', () => {
		for (const profile of [
			'shared-direct',
			'shared-checkout-pr',
			'worktree-pr',
		] as const) {
			const desired = buildDesiredState(expandProfile(profile));
			const integration = findBranchRule(desired, 'develop');
			const release = findBranchRule(desired, 'main');
			if (integration === undefined || release === undefined) {
				throw new Error('missing rule');
			}

			expect(integration.requiredApprovingReviews).toBe(
				release.requiredApprovingReviews,
			);
			// …so the invariant cannot be leaning on the approval count.
			expect(isStrictlyStronger(release, integration)).toBe(true);
			expect(
				compareStrictness(
					release,
					integration,
				).strengthenedProperties.filter(
					(property) => property !== 'requiredApprovingReviews',
				).length,
			).toBeGreaterThan(0);
		}
	});
});

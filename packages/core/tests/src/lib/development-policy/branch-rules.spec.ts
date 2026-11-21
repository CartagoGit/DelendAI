/**
 * branch-rules.spec.ts — `development.branches.rules`: how each branch
 * takes in work, its defaults, and the combinations refused at load.
 */
import { describe, expect, it } from 'vitest';

import { branchRuleFor } from '@delendai/core/lib/development-policy/branch-rules';
import { resolveDevelopmentPolicy } from '@delendai/core/lib/development-policy/resolve';
import { validateDevelopmentPolicy } from '@delendai/core/lib/development-policy/validate';

const resolve = (development: Record<string, unknown>) =>
	resolveDevelopmentPolicy({ development });

const takesIn = (development: Record<string, unknown>, branch: string) =>
	branchRuleFor(resolve(development).branches.rules, branch)?.takesIn;

describe('branch rules defaults', () => {
	it('maps requiresPullRequest to pull-request for both branches', () => {
		const development = { profile: 'shared-checkout-pr' };
		expect(takesIn(development, 'develop')).toBe('pull-request');
		expect(takesIn(development, 'main')).toBe('pull-request');
	});

	it('maps a profile without pull requests to merge', () => {
		const development = { profile: 'shared-checkout-merge' };
		expect(takesIn(development, 'develop')).toBe('merge');
		expect(takesIn(development, 'main')).toBe('merge');
	});

	it('gives a project that declares nothing the default policy rules', () => {
		const policy = resolveDevelopmentPolicy({});
		expect(policy.branches.rules.map((rule) => rule.pattern)).toEqual([
			policy.branches.integration,
			policy.branches.release,
		]);
	});

	it('keeps the profile default for the branch no rule covers', () => {
		const development = {
			profile: 'shared-checkout-merge',
			branches: { rules: { main: 'pull-request' } },
		};
		expect(takesIn(development, 'main')).toBe('pull-request');
		expect(takesIn(development, 'develop')).toBe('merge');
	});
});

describe('branch rules resolution', () => {
	it('reads the bare mode and the detailed form', () => {
		const { rules } = resolve({
			profile: 'shared-checkout-merge',
			branches: {
				rules: {
					main: { takesIn: 'pull-request', promotedFrom: 'develop' },
					develop: { takesIn: 'merge', follows: 'main' },
					'sandbox/**': 'direct',
				},
			},
		}).branches;
		expect(branchRuleFor(rules, 'main')).toEqual({
			pattern: 'main',
			takesIn: 'pull-request',
			promotedFrom: 'develop',
		});
		expect(branchRuleFor(rules, 'develop')?.follows).toBe('main');
		expect(branchRuleFor(rules, 'sandbox/a/b')?.takesIn).toBe('direct');
	});

	it('prefers an exact name over a glob', () => {
		const development = {
			branches: { rules: { 'docs/*': 'direct', 'docs/guide': 'merge' } },
		};
		expect(takesIn(development, 'docs/guide')).toBe('merge');
		expect(takesIn(development, 'docs/other')).toBe('direct');
		expect(takesIn(development, 'docs/a/b')).toBeUndefined();
	});
});

describe('branch rules validation', () => {
	const violations = (development: Record<string, unknown>) =>
		validateDevelopmentPolicy(resolve(development)).filter((violation) =>
			violation.path.startsWith('branches.rules'),
		);

	it('accepts a release branch as strict as the integration branch', () => {
		expect(
			violations({
				profile: 'shared-checkout-merge',
				branches: { rules: { main: 'pull-request' } },
			}),
		).toEqual([]);
	});

	it('refuses a release looser than its integration, naming the key', () => {
		const found = violations({
			profile: 'shared-checkout-pr',
			branches: { rules: { main: 'merge' } },
		});
		expect(found).toHaveLength(1);
		expect(found[0]?.rule).toBe('release-rule-not-looser');
		expect(found[0]?.path).toBe('branches.rules.main');
	});

	it('does not compare a release branch that is the integration branch', () => {
		expect(
			violations({
				branches: { integration: 'main', rules: { main: 'direct' } },
			}),
		).toEqual([]);
	});

	it('refuses a direct rule inside a delendai namespace', () => {
		const found = violations({
			branches: { rules: { 'pr/**': 'direct' } },
		});
		expect(found.map((violation) => violation.path)).toEqual([
			'branches.rules.pr/**',
		]);
		expect(found[0]?.rule).toBe('direct-branch-in-delendai-namespace');
	});

	it('allows a direct rule outside the namespaces', () => {
		expect(
			violations({ branches: { rules: { 'sandbox/**': 'direct' } } }),
		).toEqual([]);
	});

	it('names an unrecognised mode back with its key', () => {
		const found = violations({
			branches: { rules: { 'docs/*': 'rebase' } },
		});
		expect(found.map((violation) => violation.path)).toEqual([
			'branches.rules.docs/*.takesIn',
		]);
	});
});

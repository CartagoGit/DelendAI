/**
 * git-guard-branch-rules.spec.ts — the guard follows each branch's rule,
 * under both pinned profiles, and a project with no rules is unchanged.
 */
import { describe, expect, it } from 'vitest';

import { takeInOf } from '@delendai/core/lib/development-policy/branch-rules';
import { judgeGitOperation } from '@delendai/core/lib/development-policy/git-guard';
import { resolveDevelopmentPolicy } from '@delendai/core/lib/development-policy/resolve';

const AGENT = { agentMarker: 'AI_AGENT' } as const;
const commit = (branch: string, isMerge = false) =>
	({ kind: 'commit', branch, isMerge }) as const;
const push = (branch: string) =>
	({
		kind: 'push',
		remoteRef: `refs/heads/${branch}`,
		deleting: false,
	}) as const;

const PROFILES = ['shared-checkout-pr', 'shared-checkout-merge'] as const;

const policyOf = (
	profile: (typeof PROFILES)[number],
	rules?: Record<string, string>,
) =>
	resolveDevelopmentPolicy({
		development: {
			profile,
			...(rules === undefined ? {} : { branches: { rules } }),
		},
	});

describe.each(PROFILES)('branch rules under %s', (profile) => {
	it('refuses a direct commit and push to a pull-request branch', () => {
		const policy = policyOf(profile, { develop: 'pull-request' });
		expect(
			judgeGitOperation(policy, commit('develop'), AGENT).refused,
		).toBe(true);
		const pushed = judgeGitOperation(policy, push('develop'), AGENT);
		expect(pushed.refused).toBe(true);
		expect(pushed.reason).toContain('pull request');
	});

	it('allows a merge into a merge branch, and a push to it', () => {
		const policy = policyOf(profile, { develop: 'merge' });
		expect(takeInOf(policy, 'develop')).toBe('merge');
		expect(
			judgeGitOperation(policy, commit('develop', true), AGENT).refused,
		).toBe(false);
		expect(judgeGitOperation(policy, push('develop'), AGENT).refused).toBe(
			false,
		);
	});

	it('lets a direct branch take commits and pushes from an agent', () => {
		const policy = policyOf(profile, { 'sandbox/**': 'direct' });
		expect(
			judgeGitOperation(policy, commit('sandbox/a'), AGENT).refused,
		).toBe(false);
		expect(
			judgeGitOperation(policy, push('sandbox/a'), AGENT).refused,
		).toBe(false);
	});

	it('behaves as before when no rules are declared', () => {
		const policy = policyOf(profile);
		const pr = profile === 'shared-checkout-pr';
		expect(judgeGitOperation(policy, push('develop'), AGENT).refused).toBe(
			pr,
		);
		expect(judgeGitOperation(policy, push('main'), AGENT).refused).toBe(pr);
		expect(
			judgeGitOperation(policy, commit('develop'), AGENT).refused,
		).toBe(true);
		expect(
			judgeGitOperation(policy, push('sandbox/a'), AGENT).refused,
		).toBe(true);
	});
});

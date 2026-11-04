/**
 * forward-sync.service.spec.ts — a promotion opens by its target's route,
 * a follower takes in by its own, and nothing happens with nothing to take.
 */
import { describe, expect, it } from 'vitest';

import type { IBranchSyncPorts } from '@delendai/core/lib/contracts/interfaces/forward-sync.interface';
import {
	followBranches,
	promoteBranch,
} from '@delendai/core/lib/release/forward-sync.service';
import { resolveDevelopmentPolicy } from '@delendai/core/lib/development-policy/resolve';

const policyOf = (rules: Record<string, unknown>) =>
	resolveDevelopmentPolicy({
		development: {
			profile: 'shared-checkout-merge',
			branches: { rules },
		},
	});

const ports = (behind: boolean) => {
	const calls: string[] = [];
	const value: IBranchSyncPorts = {
		isAncestor: () => !behind,
		openPullRequest: (base, head) => {
			calls.push(`pr ${head}->${base}`);
			return { ok: true, detail: 'opened' };
		},
		merge: (target, source) => {
			calls.push(`merge ${source}->${target}`);
			return { ok: true, detail: 'merged' };
		},
	};
	return { value, calls };
};

const RULES = {
	main: { takesIn: 'pull-request', promotedFrom: 'develop' },
	develop: { takesIn: 'merge', follows: 'main' },
};

describe('promotion', () => {
	it('opens a pull request into a pull-request branch', () => {
		const { value, calls } = ports(true);
		const result = promoteBranch(policyOf(RULES), 'main', value);
		expect(result.outcome).toBe('pull-request');
		expect(calls).toEqual(['pr develop->main']);
	});

	it('merges into a merge branch', () => {
		const { value, calls } = ports(true);
		const rules = { main: { takesIn: 'merge', promotedFrom: 'develop' } };
		expect(promoteBranch(policyOf(rules), 'main', value).outcome).toBe(
			'merged',
		);
		expect(calls).toEqual(['merge develop->main']);
	});

	it('does nothing when there is nothing to take', () => {
		const { value, calls } = ports(false);
		expect(promoteBranch(policyOf(RULES), 'main', value).outcome).toBe(
			'nothing',
		);
		expect(calls).toEqual([]);
	});

	it('refuses a branch that names no source', () => {
		const { value } = ports(true);
		expect(promoteBranch(policyOf(RULES), 'develop', value).outcome).toBe(
			'failed',
		);
	});
});

describe('follow', () => {
	it('has the follower take in its source by its own route', () => {
		const { value, calls } = ports(true);
		const results = followBranches(policyOf(RULES), value);
		expect(results.map((r) => r.outcome)).toEqual(['merged']);
		expect(calls).toEqual(['merge main->develop']);
	});

	it('takes in by pull request when the follower says so', () => {
		const { value, calls } = ports(true);
		const rules = { develop: { takesIn: 'pull-request', follows: 'main' } };
		followBranches(policyOf(rules), value);
		expect(calls).toEqual(['pr main->develop']);
	});

	it('does nothing when the follower already has the source', () => {
		const { value, calls } = ports(false);
		expect(
			followBranches(policyOf(RULES), value).map((r) => r.outcome),
		).toEqual(['nothing']);
		expect(calls).toEqual([]);
	});
});

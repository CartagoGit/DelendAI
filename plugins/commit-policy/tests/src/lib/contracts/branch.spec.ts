/**
 * branch.spec.ts — covers x00267 (AUD-CP-009) unified branch
 * protection: exact names + prefixes, branchPolicy.isProtected.
 */

import { describe, expect, it } from 'vitest';

import {
	DEFAULT_BRANCH_POLICY,
	branchProtectedRefusal,
	isBranchProtected,
	type IBranchPolicy,
} from '@mcp-vertex/commit-policy/lib/contracts/branch';

const basePolicy = (overrides: Partial<IBranchPolicy> = {}): IBranchPolicy => ({
	...DEFAULT_BRANCH_POLICY,
	...overrides,
});

describe('isBranchProtected', () => {
	it('does not protect conventional names when lists are empty', () => {
		expect(isBranchProtected('main', basePolicy())).toBe(false);
		expect(isBranchProtected('develop', basePolicy())).toBe(false);
		expect(isBranchProtected('master', basePolicy())).toBe(false);
	});

	it('protects only configured exact names and prefixes', () => {
		const policy = basePolicy({
			protected: ['develop'],
			protectedPrefixes: ['release/'],
		});
		expect(isBranchProtected('develop', policy)).toBe(true);
		expect(isBranchProtected('release/2025-q3', policy)).toBe(true);
		expect(isBranchProtected('main', policy)).toBe(false);
		expect(isBranchProtected('master', policy)).toBe(false);
	});

	it('returns false for non-protected branches', () => {
		expect(isBranchProtected('feature/x', basePolicy())).toBe(false);
		expect(isBranchProtected('develop', basePolicy())).toBe(false);
	});

	it('returns false for undefined branch (detached HEAD is its own refusal)', () => {
		expect(isBranchProtected(undefined, basePolicy())).toBe(false);
	});

	it('honours a custom exact + prefix list', () => {
		const policy = basePolicy({
			protected: ['prod'],
			protectedPrefixes: ['staging-'],
		});
		expect(isBranchProtected('prod', policy)).toBe(true);
		expect(isBranchProtected('staging-foo', policy)).toBe(true);
		expect(isBranchProtected('main', policy)).toBe(false);
	});
});

describe('branchProtectedRefusal', () => {
	it('embeds the branch + the policy sources', () => {
		const refusal = branchProtectedRefusal('develop', basePolicy());
		expect(refusal).toContain('BRANCH_PROTECTED');
		expect(refusal).toContain('"develop"');
		expect(refusal).toContain('exact=');
		expect(refusal).toContain('prefixes=');
	});
});

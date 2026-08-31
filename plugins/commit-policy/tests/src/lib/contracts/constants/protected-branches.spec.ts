/**
 * protected-branches.spec.ts — c00145 (Track A.default).
 *
 * Verifies the canonical protected-branches default.
 * Patterns are serialized with `RegExp#toString()` because the resolver's
 * public contract returns strings rather than matcher objects.
 */
import { describe, expect, it } from 'vitest';

import {
	DEFAULT_PROTECTED_BRANCHES,
	DEFAULT_PROTECTED_BRANCH_PATTERNS,
	DEFAULT_PROTECTED_BRANCHES_V2,
	isNeverProtected,
	resolveProtectedBranches,
} from '@mcp-vertex/commit-policy/lib/contracts/constants/protected-branches';

describe('c00145 — protected branches default', () => {
	it('keeps the deprecated v1 default empty for compatibility', () => {
		expect(DEFAULT_PROTECTED_BRANCHES).toEqual([]);
	});

	it('exports the v2 literal default branch list', () => {
		expect(DEFAULT_PROTECTED_BRANCHES_V2).toEqual(['main']);
	});

	it('resolves v2 defaults when no explicit config is given', () => {
		expect(resolveProtectedBranches(undefined)).toEqual([
			'main',
			...DEFAULT_PROTECTED_BRANCH_PATTERNS.map((pattern) =>
				pattern.toString(),
			),
		]);
	});

	it('merges explicit literals with the default release matcher token', () => {
		expect(resolveProtectedBranches(['main'])).toEqual([
			'main',
			...DEFAULT_PROTECTED_BRANCH_PATTERNS.map((pattern) =>
				pattern.toString(),
			),
		]);
	});

	it('never protects agent/worktree branches even when listed', () => {
		expect(
			resolveProtectedBranches(['main', 'agent/copilot', 'worktree/foo']),
		).toEqual([
			'main',
			...DEFAULT_PROTECTED_BRANCH_PATTERNS.map((pattern) =>
				pattern.toString(),
			),
		]);
		expect(isNeverProtected('agent/copilot')).toBe(true);
		expect(isNeverProtected('worktree/foo')).toBe(true);
		expect(isNeverProtected('develop')).toBe(false);
		expect(isNeverProtected('release/v1.0.0/foo')).toBe(false);
	});
});

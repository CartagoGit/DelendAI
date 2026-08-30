/**
 * protected-branches.spec.ts — c00145 (Track A.default).
 *
 * Verifies the canonical protected-branches default:
 *   - default is main/master (NO develop by default — c00131 reversal).
 *   - explicit config replaces the default (no implicit merge).
 *   - agent/worktree branches are never protected.
 */
import { describe, expect, it } from 'vitest';

import {
	DEFAULT_PROTECTED_BRANCHES,
	isNeverProtected,
	OPTIONAL_PROTECTED_BRANCHES,
	resolveProtectedBranches,
} from '@mcp-vertex/commit-policy/lib/contracts/constants/protected-branches';

describe('c00145 — protected branches default', () => {
	it('default is main/master without develop', () => {
		expect(DEFAULT_PROTECTED_BRANCHES).toEqual(['main', 'master']);
		expect(DEFAULT_PROTECTED_BRANCHES).not.toContain('develop');
	});

	it('develop lives in OPTIONAL (opt-in) branches, not the default', () => {
		expect(OPTIONAL_PROTECTED_BRANCHES).toContain('develop');
	});

	it('resolves to the default when no explicit config is given', () => {
		expect(resolveProtectedBranches(undefined)).toEqual(['main', 'master']);
	});

	it('explicit config replaces the default (no implicit merge)', () => {
		expect(resolveProtectedBranches(['main', 'develop'])).toEqual([
			'main',
			'develop',
		]);
		expect(resolveProtectedBranches(['main', 'develop'])).not.toContain(
			'master',
		);
	});

	it('never protects agent/worktree branches even when listed', () => {
		expect(
			resolveProtectedBranches(['main', 'agent/copilot', 'worktree/foo']),
		).toEqual(['main']);
		expect(isNeverProtected('agent/copilot')).toBe(true);
		expect(isNeverProtected('worktree/foo')).toBe(true);
		expect(isNeverProtected('main')).toBe(false);
	});
});

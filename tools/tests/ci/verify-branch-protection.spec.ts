/**
 * verify-branch-protection.spec.ts — the asymmetry is the point.
 *
 * `develop` is the branch this repo is programmed on and is deliberately
 * unprotected; `main` is the release branch and is locked down. A single
 * symmetric policy is what previously forced both to be treated alike,
 * so these tests pin each direction of the asymmetry — including the
 * inverse drift, where someone protects the working branch without
 * updating the declared policy.
 */
import { describe, expect, it } from 'vitest';

import { diffBranch } from '../../scripts/ci/verify-branch-protection.script.ts';

const strictLive = {
	enforce_admins: { enabled: true },
	required_linear_history: { enabled: true },
	allow_force_pushes: { enabled: false },
	allow_deletion: { enabled: false },
	required_status_checks: { contexts: ['ci-complete'] },
};

describe('diffBranch', () => {
	it('accepts an unprotected branch that is declared unprotected', () => {
		const drifts = diffBranch(
			{ name: 'develop', protected: false, required_checks: [] },
			null,
		);
		expect(drifts).toEqual([]);
	});

	it('reports the inverse drift when a working branch gets protected', () => {
		const drifts = diffBranch(
			{ name: 'develop', protected: false, required_checks: [] },
			strictLive,
		);
		expect(drifts).toHaveLength(1);
		expect(drifts[0]?.detail).toContain('declared unprotected');
	});

	it('accepts a protected branch that matches the policy', () => {
		const drifts = diffBranch(
			{ name: 'main', protected: true, required_checks: ['ci-complete'] },
			strictLive,
		);
		expect(drifts).toEqual([]);
	});

	it('reports a protected branch that has no rule at all', () => {
		const drifts = diffBranch(
			{ name: 'main', protected: true, required_checks: ['ci-complete'] },
			null,
		);
		expect(drifts[0]?.kind).toBe('MISSING');
	});

	it('reports a missing required check on the protected branch', () => {
		const drifts = diffBranch(
			{ name: 'main', protected: true, required_checks: ['ci-complete'] },
			{ ...strictLive, required_status_checks: { contexts: [] } },
		);
		expect(drifts.some((d) => d.kind === 'CHECK_DRIFT')).toBe(true);
	});

	it('reports force pushes re-enabled on the protected branch', () => {
		const drifts = diffBranch(
			{ name: 'main', protected: true, required_checks: ['ci-complete'] },
			{ ...strictLive, allow_force_pushes: { enabled: true } },
		);
		expect(
			drifts.some((d) => d.detail.includes('allow_force_pushes')),
		).toBe(true);
	});
});

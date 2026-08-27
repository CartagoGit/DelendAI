/**
 * verify-branch-protection.spec.ts — x00276-x00279.
 *
 * `develop` is the branch this repo is programmed on and is deliberately
 * unprotected; `main` is the release branch and is locked down. A single
 * symmetric policy is what previously forced both to be treated alike,
 * so these tests pin each direction of the asymmetry — including the
 * inverse drift, where someone protects the working branch without
 * updating the declared policy.
 *
 * `LIVE_MAIN_FIXTURE` is the literal live response for `main` quoted in
 * the audit (AUD-A06's evidence) — this is the fixture that would have
 * caught the `allow_deletion`/`allow_deletions` typo on its own.
 */
import { describe, expect, it } from 'vitest';

import type { IBranchProtectionConfig } from '../../../.github/branch-protection.ts';
import {
	diffBranch,
	main,
} from '../../scripts/ci/verify-branch-protection.script.ts';

const DEFAULTS: IBranchProtectionConfig['defaults'] = {
	enforce_admins: true,
	required_linear_history: true,
	allow_force_pushes: false,
	allow_deletions: false,
};

// The literal API response for `main` copied from the audit evidence.
const LIVE_MAIN_FIXTURE = {
	required_status_checks: { strict: true, contexts: ['ci-complete'] },
	enforce_admins: { enabled: true },
	required_linear_history: { enabled: true },
	allow_force_pushes: { enabled: false },
	allow_deletions: { enabled: false },
};

describe('diffBranch', () => {
	it('accepts an unprotected branch that is declared unprotected', () => {
		const drifts = diffBranch(
			{ name: 'develop', protected: false, required_checks: [] },
			null,
			DEFAULTS,
		);
		expect(drifts).toEqual([]);
	});

	it('reports the inverse drift when a working branch gets protected', () => {
		const drifts = diffBranch(
			{ name: 'develop', protected: false, required_checks: [] },
			LIVE_MAIN_FIXTURE,
			DEFAULTS,
		);
		expect(drifts).toHaveLength(1);
		expect(drifts[0]?.detail).toContain('declared unprotected');
	});

	it('the literal live response for main produces 0 drifts — this is the AUD-A06 regression test', () => {
		const drifts = diffBranch(
			{ name: 'main', protected: true, required_checks: ['ci-complete'] },
			LIVE_MAIN_FIXTURE,
			DEFAULTS,
		);
		expect(drifts).toEqual([]);
	});

	it('reports a protected branch that has no rule at all', () => {
		const drifts = diffBranch(
			{ name: 'main', protected: true, required_checks: ['ci-complete'] },
			null,
			DEFAULTS,
		);
		expect(drifts[0]?.kind).toBe('MISSING');
	});

	it('reports a missing required check on the protected branch', () => {
		const drifts = diffBranch(
			{ name: 'main', protected: true, required_checks: ['ci-complete'] },
			{ ...LIVE_MAIN_FIXTURE, required_status_checks: { contexts: [] } },
			DEFAULTS,
		);
		expect(drifts.some((d) => d.kind === 'CHECK_DRIFT')).toBe(true);
	});

	it('reports force pushes re-enabled on the protected branch', () => {
		const drifts = diffBranch(
			{ name: 'main', protected: true, required_checks: ['ci-complete'] },
			{ ...LIVE_MAIN_FIXTURE, allow_force_pushes: { enabled: true } },
			DEFAULTS,
		);
		expect(
			drifts.some((d) => d.detail.includes('allow_force_pushes')),
		).toBe(true);
	});

	it('reports allow_deletions re-enabled — this field alone was always undefined before x00278', () => {
		const drifts = diffBranch(
			{ name: 'main', protected: true, required_checks: ['ci-complete'] },
			{ ...LIVE_MAIN_FIXTURE, allow_deletions: { enabled: true } },
			DEFAULTS,
		);
		expect(drifts.some((d) => d.detail.includes('allow_deletions'))).toBe(
			true,
		);
	});

	describe('defaults are consumed, not hardcoded (AUD-A07)', () => {
		it('enforce_admins: false in defaults flips the verdict', () => {
			const relaxed = { ...DEFAULTS, enforce_admins: false };
			const liveWithoutEnforceAdmins = {
				...LIVE_MAIN_FIXTURE,
				enforce_admins: { enabled: false },
			};
			expect(
				diffBranch(
					{
						name: 'main',
						protected: true,
						required_checks: ['ci-complete'],
					},
					liveWithoutEnforceAdmins,
					DEFAULTS,
				).length,
			).toBeGreaterThan(0);
			expect(
				diffBranch(
					{
						name: 'main',
						protected: true,
						required_checks: ['ci-complete'],
					},
					liveWithoutEnforceAdmins,
					relaxed,
				),
			).toEqual([]);
		});

		it('required_linear_history: false in defaults flips the verdict', () => {
			const relaxed = { ...DEFAULTS, required_linear_history: false };
			const live = {
				...LIVE_MAIN_FIXTURE,
				required_linear_history: { enabled: false },
			};
			expect(
				diffBranch(
					{
						name: 'main',
						protected: true,
						required_checks: ['ci-complete'],
					},
					live,
					DEFAULTS,
				).length,
			).toBeGreaterThan(0);
			expect(
				diffBranch(
					{
						name: 'main',
						protected: true,
						required_checks: ['ci-complete'],
					},
					live,
					relaxed,
				),
			).toEqual([]);
		});

		it('allow_force_pushes: true in defaults flips the verdict', () => {
			const relaxed = { ...DEFAULTS, allow_force_pushes: true };
			const live = {
				...LIVE_MAIN_FIXTURE,
				allow_force_pushes: { enabled: true },
			};
			expect(
				diffBranch(
					{
						name: 'main',
						protected: true,
						required_checks: ['ci-complete'],
					},
					live,
					DEFAULTS,
				).length,
			).toBeGreaterThan(0);
			expect(
				diffBranch(
					{
						name: 'main',
						protected: true,
						required_checks: ['ci-complete'],
					},
					live,
					relaxed,
				),
			).toEqual([]);
		});

		it('allow_deletions: true in defaults flips the verdict', () => {
			const relaxed = { ...DEFAULTS, allow_deletions: true };
			const live = {
				...LIVE_MAIN_FIXTURE,
				allow_deletions: { enabled: true },
			};
			expect(
				diffBranch(
					{
						name: 'main',
						protected: true,
						required_checks: ['ci-complete'],
					},
					live,
					DEFAULTS,
				).length,
			).toBeGreaterThan(0);
			expect(
				diffBranch(
					{
						name: 'main',
						protected: true,
						required_checks: ['ci-complete'],
					},
					live,
					relaxed,
				),
			).toEqual([]);
		});
	});
});

// ── main(): the verdict model end-to-end, with a stubbed fetch ──────────

const originalFetch = globalThis.fetch;
const stubFetch = (impl: (url: string) => Promise<Response>): void => {
	globalThis.fetch = impl as typeof fetch;
};
const restoreFetch = (): void => {
	globalThis.fetch = originalFetch;
};
const jsonResponse = (body: unknown, status = 200): Response =>
	new Response(JSON.stringify(body), {
		status,
		headers: { 'content-type': 'application/json' },
	});

describe('main() — three-state verdict', () => {
	it('all branches 403 without an explicit token ⇒ exit 0, unverified, never silent', async () => {
		stubFetch(async () => jsonResponse({ message: 'no admin scope' }, 403));
		delete process.env.BRANCH_PROTECTION_TOKEN;
		const originalToken = process.env.GITHUB_TOKEN;
		process.env.GITHUB_TOKEN = 'ambient-token';
		try {
			const code = await main(['--repo', 'foo/bar']);
			expect(code).toBe(0);
		} finally {
			restoreFetch();
			process.env.GITHUB_TOKEN = originalToken;
		}
	});

	it('all branches 403 WITH an explicit token ⇒ exit != 0', async () => {
		stubFetch(async () => jsonResponse({ message: 'bad token' }, 403));
		try {
			const code = await main([
				'--repo',
				'foo/bar',
				'--token',
				'a-deliberately-configured-pat',
			]);
			expect(code).not.toBe(0);
		} finally {
			restoreFetch();
		}
	});

	it('one readable branch with drift + one unreadable ⇒ drift is still reported, not masked', async () => {
		stubFetch(async (url) => {
			const u = url.toString();
			if (u.includes('/branches/main/protection')) {
				return jsonResponse({
					...LIVE_MAIN_FIXTURE,
					allow_force_pushes: { enabled: true }, // drift
				});
			}
			// develop is unreadable
			return jsonResponse({ message: 'no admin scope' }, 403);
		});
		delete process.env.BRANCH_PROTECTION_TOKEN;
		const originalToken = process.env.GITHUB_TOKEN;
		process.env.GITHUB_TOKEN = 'ambient-token';
		try {
			const code = await main(['--repo', 'foo/bar']);
			expect(code).toBe(1);
		} finally {
			restoreFetch();
			process.env.GITHUB_TOKEN = originalToken;
		}
	});

	it('a readable branch with no drift passes even when the other is unreadable', async () => {
		stubFetch(async (url) => {
			const u = url.toString();
			if (u.includes('/branches/main/protection'))
				return jsonResponse(LIVE_MAIN_FIXTURE);
			return jsonResponse({ message: 'no admin scope' }, 403);
		});
		delete process.env.BRANCH_PROTECTION_TOKEN;
		const originalToken = process.env.GITHUB_TOKEN;
		process.env.GITHUB_TOKEN = 'ambient-token';
		try {
			const code = await main(['--repo', 'foo/bar']);
			expect(code).toBe(0);
		} finally {
			restoreFetch();
			process.env.GITHUB_TOKEN = originalToken;
		}
	});
});

/**
 * verify-develop-health.spec.ts — covers v00125, x00276-x00279.
 *
 * Tests the report-shape logic with a mocked fetch. The real
 * GitHub API is exercised by the nightly CI job.
 *
 * This script and `verify-branch-protection.script.ts` read the same
 * endpoint through the same shared client
 * (`tools/scripts/ci/lib/github-protection.lib.ts`) and must reach the
 * same verdict for the same fixture — the "parity" tests below assert
 * that directly.
 */

import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { describe, expect, it } from 'vitest';

import type { IBranchProtectionConfig } from '../../../.github/branch-protection.ts';
import {
	inspectBranch,
	isHealthy,
	main as healthMain,
} from '../../scripts/ci/verify-develop-health.script';
import { main as protectionMain } from '../../scripts/ci/verify-branch-protection.script';

const DEFAULTS: IBranchProtectionConfig['defaults'] = {
	enforce_admins: true,
	required_linear_history: true,
	allow_force_pushes: false,
	allow_deletions: false,
};

// The literal API response for `main` copied from the audit evidence.
const LIVE_MAIN_FIXTURE = {
	required_status_checks: {
		strict: true,
		contexts: ['ci-complete', 'release-pr-gate'],
	},
	enforce_admins: { enabled: true },
	required_linear_history: { enabled: true },
	allow_force_pushes: { enabled: false },
	allow_deletions: { enabled: false },
};

const GREEN_CHECK_RUNS_FIXTURE = {
	check_runs: [
		{
			name: 'ci-complete',
			status: 'completed',
			conclusion: 'success',
			head_sha: 'abc123',
			html_url: 'https://example.test/checks/1',
		},
		{
			name: 'release-pr-gate',
			status: 'completed',
			conclusion: 'success',
			head_sha: 'abc123',
			html_url: 'https://example.test/checks/2',
		},
	],
};

const RED_CHECK_RUNS_FIXTURE = {
	check_runs: [
		{
			name: 'ci-complete',
			status: 'completed',
			conclusion: 'failure',
			head_sha: 'abc123',
			html_url: 'https://example.test/checks/1',
		},
		{
			name: 'release-pr-gate',
			status: 'completed',
			conclusion: 'success',
			head_sha: 'abc123',
			html_url: 'https://example.test/checks/2',
		},
	],
};

const MAIN_POLICY: IBranchProtectionConfig['branches'][number] = {
	name: 'main',
	protected: true,
	required_checks: ['ci-complete', 'release-pr-gate'],
};

describe('inspectBranch + isHealthy', () => {
	it('the literal live response for main is healthy — the AUD-A06 regression test', () => {
		const health = inspectBranch(
			MAIN_POLICY,
			LIVE_MAIN_FIXTURE,
			true,
			DEFAULTS,
		);
		expect(health.allow_deletions).toBe(true);
		expect(isHealthy([health])).toBe(true);
	});

	it('an unverified branch is never healthy by vacuity', () => {
		const health = inspectBranch(MAIN_POLICY, null, false, DEFAULTS);
		expect(isHealthy([health])).toBe(false);
	});

	it('allow_deletions re-enabled makes the branch unhealthy', () => {
		const health = inspectBranch(
			MAIN_POLICY,
			{ ...LIVE_MAIN_FIXTURE, allow_deletions: { enabled: true } },
			true,
			DEFAULTS,
		);
		expect(health.allow_deletions).toBe(false);
		expect(isHealthy([health])).toBe(false);
	});

	describe('defaults are consumed, not hardcoded (AUD-A07)', () => {
		it('allow_force_pushes: true in defaults flips healthy for a branch with force-push enabled', () => {
			const live = {
				...LIVE_MAIN_FIXTURE,
				allow_force_pushes: { enabled: true },
			};
			expect(
				isHealthy([inspectBranch(MAIN_POLICY, live, true, DEFAULTS)]),
			).toBe(false);
			expect(
				isHealthy([
					inspectBranch(MAIN_POLICY, live, true, {
						...DEFAULTS,
						allow_force_pushes: true,
					}),
				]),
			).toBe(true);
		});

		it('enforce_admins: false in defaults flips healthy for a branch without enforce_admins', () => {
			const live = {
				...LIVE_MAIN_FIXTURE,
				enforce_admins: { enabled: false },
			};
			expect(
				isHealthy([inspectBranch(MAIN_POLICY, live, true, DEFAULTS)]),
			).toBe(false);
			expect(
				isHealthy([
					inspectBranch(MAIN_POLICY, live, true, {
						...DEFAULTS,
						enforce_admins: false,
					}),
				]),
			).toBe(true);
		});

		it('required_linear_history: false in defaults flips healthy', () => {
			const live = {
				...LIVE_MAIN_FIXTURE,
				required_linear_history: { enabled: false },
			};
			expect(
				isHealthy([inspectBranch(MAIN_POLICY, live, true, DEFAULTS)]),
			).toBe(false);
			expect(
				isHealthy([
					inspectBranch(MAIN_POLICY, live, true, {
						...DEFAULTS,
						required_linear_history: false,
					}),
				]),
			).toBe(true);
		});

		it('allow_deletions: true in defaults flips healthy', () => {
			const live = {
				...LIVE_MAIN_FIXTURE,
				allow_deletions: { enabled: true },
			};
			expect(
				isHealthy([inspectBranch(MAIN_POLICY, live, true, DEFAULTS)]),
			).toBe(false);
			expect(
				isHealthy([
					inspectBranch(MAIN_POLICY, live, true, {
						...DEFAULTS,
						allow_deletions: true,
					}),
				]),
			).toBe(true);
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

const stubHealthyFetch = (): void => {
	stubFetch(async (url) => {
		const u = url.toString();
		if (u.includes('/commits/develop/check-runs')) {
			return jsonResponse(GREEN_CHECK_RUNS_FIXTURE);
		}
		if (u.includes('/branches/main/protection')) {
			return jsonResponse(LIVE_MAIN_FIXTURE);
		}
		return jsonResponse({ message: 'Not Found' }, 404);
	});
};

describe('main() — three-state verdict', () => {
	it('refuses without --repo', async () => {
		const code = await healthMain([]);
		expect(code).toBe(2);
	});

	it('dry-run is offline and returns an unverified structured report', async () => {
		const originalFetch = globalThis.fetch;
		globalThis.fetch = (() => {
			throw new Error('dry-run must not contact GitHub');
		}) as unknown as typeof fetch;
		try {
			const code = await healthMain(['--repo', 'foo/bar', '--dry-run']);
			expect(code).toBe(0);
		} finally {
			globalThis.fetch = originalFetch;
		}
	});

	it('returns healthy=true when every branch matches', async () => {
		stubHealthyFetch();
		try {
			const code = await healthMain(['--repo', 'foo/bar']);
			expect(code).toBe(0);
		} finally {
			restoreFetch();
		}
	});

	it('writes the dashboard JSON shape when --output is provided', async () => {
		stubHealthyFetch();
		const tempDir = await mkdtemp(join(tmpdir(), 'verify-develop-health-'));
		const outputPath = join(tempDir, 'develop-health.json');
		try {
			const code = await healthMain([
				'--repo',
				'foo/bar',
				'--output',
				outputPath,
			]);
			expect(code).toBe(0);
			const written = JSON.parse(await readFile(outputPath, 'utf8')) as {
				lastVerifiedAt: string | null;
				ciStatus: string;
				protectedBranches: {
					main: boolean | null;
					develop: boolean | null;
				};
				requiredChecks: string[];
				discrepancies: string[];
			};
			expect(written.lastVerifiedAt).not.toBeNull();
			expect(written.ciStatus).toBe('green');
			expect(written.protectedBranches).toEqual({
				main: true,
				develop: false,
			});
			expect(written.requiredChecks).toEqual([
				'ci-complete',
				'release-pr-gate',
			]);
			expect(written.discrepancies).toEqual([]);
		} finally {
			restoreFetch();
			await rm(tempDir, { recursive: true, force: true });
		}
	});

	it('returns exit 1 when a required check is missing', async () => {
		stubFetch(async (url) => {
			const u = url.toString();
			if (u.includes('/commits/develop/check-runs')) {
				return jsonResponse({ check_runs: [] });
			}
			if (u.includes('/branches/main/protection'))
				return jsonResponse({
					...LIVE_MAIN_FIXTURE,
					required_status_checks: {
						strict: true,
						contexts: ['lint-biome'],
					},
				});
			return jsonResponse({ message: 'not found' }, 404);
		});
		try {
			const code = await healthMain(['--repo', 'foo/bar']);
			expect(code).toBe(1);
		} finally {
			restoreFetch();
		}
	});

	it('returns exit 1 when develop latest required check-run is red', async () => {
		stubFetch(async (url) => {
			const u = url.toString();
			if (u.includes('/commits/develop/check-runs')) {
				return jsonResponse(RED_CHECK_RUNS_FIXTURE);
			}
			if (u.includes('/branches/main/protection')) {
				return jsonResponse(LIVE_MAIN_FIXTURE);
			}
			return jsonResponse({ message: 'not found' }, 404);
		});
		try {
			const code = await healthMain(['--repo', 'foo/bar']);
			expect(code).toBe(1);
		} finally {
			restoreFetch();
		}
	});

	it('returns exit 1 when the protected branch has no rule (404 on a branch declared protected: true)', async () => {
		stubFetch(async (url) => {
			if (url.toString().includes('/commits/develop/check-runs')) {
				return jsonResponse(GREEN_CHECK_RUNS_FIXTURE);
			}
			return jsonResponse({ message: 'Not Found' }, 404);
		});
		try {
			const code = await healthMain(['--repo', 'foo/bar']);
			expect(code).toBe(1);
		} finally {
			restoreFetch();
		}
	});

	it("404 on a branch declared protected: false passes (develop's own healthy state)", async () => {
		// Every branch 404s — main included, which would be drift; isolate to
		// just confirm the unprotected branch alone never fails on 404.
		stubFetch(async () => jsonResponse({ message: 'Not Found' }, 404));
		const health = inspectBranch(
			{ name: 'develop', protected: false, required_checks: [] },
			null,
			true,
			DEFAULTS,
		);
		expect(isHealthy([health])).toBe(true);
	});

	it('all branches 403 without an explicit token ⇒ exit 0, unverified, never silent', async () => {
		stubFetch(async () => jsonResponse({ message: 'no admin scope' }, 403));
		delete process.env.BRANCH_PROTECTION_TOKEN;
		const originalToken = process.env.GITHUB_TOKEN;
		process.env.GITHUB_TOKEN = 'ambient-token';
		try {
			const code = await healthMain(['--repo', 'foo/bar']);
			expect(code).toBe(0);
		} finally {
			restoreFetch();
			process.env.GITHUB_TOKEN = originalToken;
		}
	});

	it('all branches 403 WITH an explicit token ⇒ exit != 0', async () => {
		stubFetch(async () => jsonResponse({ message: 'bad token' }, 403));
		try {
			const code = await healthMain([
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

	it('one readable branch with drift + one unreadable ⇒ drift is still reported', async () => {
		stubFetch(async (url) => {
			const u = url.toString();
			if (u.includes('/commits/develop/check-runs')) {
				return jsonResponse(GREEN_CHECK_RUNS_FIXTURE);
			}
			if (u.includes('/branches/main/protection')) {
				return jsonResponse({
					...LIVE_MAIN_FIXTURE,
					allow_force_pushes: { enabled: true },
				});
			}
			return jsonResponse({ message: 'no admin scope' }, 403);
		});
		delete process.env.BRANCH_PROTECTION_TOKEN;
		const originalToken = process.env.GITHUB_TOKEN;
		process.env.GITHUB_TOKEN = 'ambient-token';
		try {
			const code = await healthMain(['--repo', 'foo/bar']);
			expect(code).toBe(1);
		} finally {
			restoreFetch();
			process.env.GITHUB_TOKEN = originalToken;
		}
	});
});

describe('parity — verify-branch-protection and verify-develop-health agree', () => {
	const fixtures: ReadonlyArray<{
		readonly name: string;
		readonly status: number;
		readonly body: unknown;
		readonly checkRunsStatus?: number;
		readonly checkRunsBody?: unknown;
		readonly tokenExplicit: boolean;
	}> = [
		{
			name: 'live, matches policy',
			status: 200,
			body: LIVE_MAIN_FIXTURE,
			checkRunsBody: GREEN_CHECK_RUNS_FIXTURE,
			tokenExplicit: false,
		},
		{
			name: 'live, drift (force pushes allowed)',
			status: 200,
			body: {
				...LIVE_MAIN_FIXTURE,
				allow_force_pushes: { enabled: true },
			},
			checkRunsBody: GREEN_CHECK_RUNS_FIXTURE,
			tokenExplicit: false,
		},
		{
			name: '404 unprotected',
			status: 404,
			body: { message: 'Not Found' },
			checkRunsBody: GREEN_CHECK_RUNS_FIXTURE,
			tokenExplicit: false,
		},
		{
			name: '403 no explicit token',
			status: 403,
			body: { message: 'no scope' },
			checkRunsStatus: 403,
			checkRunsBody: { message: 'no scope' },
			tokenExplicit: false,
		},
		{
			name: '403 with explicit token',
			status: 403,
			body: { message: 'bad token' },
			checkRunsStatus: 403,
			checkRunsBody: { message: 'bad token' },
			tokenExplicit: true,
		},
	];

	for (const fx of fixtures) {
		it(`reaches the same pass/fail exit-code shape for: ${fx.name}`, async () => {
			stubFetch(async (url) => {
				if (url.toString().includes('/commits/develop/check-runs')) {
					return jsonResponse(
						fx.checkRunsBody ?? GREEN_CHECK_RUNS_FIXTURE,
						fx.checkRunsStatus ?? 200,
					);
				}
				return jsonResponse(fx.body, fx.status);
			});
			delete process.env.BRANCH_PROTECTION_TOKEN;
			const originalToken = process.env.GITHUB_TOKEN;
			process.env.GITHUB_TOKEN = 'ambient-token';
			const args = fx.tokenExplicit
				? ['--repo', 'foo/bar', '--token', 'explicit-pat']
				: ['--repo', 'foo/bar'];
			try {
				const protectionCode = await protectionMain(args);
				const healthCode = await healthMain(args);
				// Both scripts must agree on whether the run is a hard failure
				// (exit 1) or not (exit 0 — pass or unverified).
				expect(healthCode === 1).toBe(protectionCode === 1);
			} finally {
				restoreFetch();
				process.env.GITHUB_TOKEN = originalToken;
			}
		});
	}
});

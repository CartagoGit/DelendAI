/**
 * github-protection.lib.spec.ts — x00276 / x00277 / x00278.
 *
 * The fixture in `LIVE_MAIN_RESPONSE` is the literal API response for
 * `main` quoted in the audit (AUD-A06's evidence). It anchors the
 * fixture used by both verifiers' own specs so a rename regression in
 * either script would show up here first.
 */
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import {
	appendGitHubStepSummary,
	fetchBranchProtection,
	GitHubProtectionAuthError,
	parseGitHubBranchProtectionResponse,
	reportUnverifiedBranches,
} from '../../../scripts/ci/lib/github-protection.lib.ts';

const LIVE_MAIN_RESPONSE = {
	required_status_checks: { strict: true, contexts: ['ci-complete'] },
	enforce_admins: { enabled: true },
	required_linear_history: { enabled: true },
	allow_force_pushes: { enabled: false },
	allow_deletions: { enabled: false },
};

const originalFetch = globalThis.fetch;
const stubFetch = (impl: (url: string) => Promise<Response>): void => {
	globalThis.fetch = impl as typeof fetch;
};
const jsonResponse = (body: unknown, status = 200): Response =>
	new Response(JSON.stringify(body), {
		status,
		headers: { 'content-type': 'application/json' },
	});

afterEach(() => {
	globalThis.fetch = originalFetch;
	delete process.env.GITHUB_STEP_SUMMARY;
});

describe('parseGitHubBranchProtectionResponse', () => {
	it('parses the literal live response for main', () => {
		const parsed = parseGitHubBranchProtectionResponse(LIVE_MAIN_RESPONSE);
		expect(parsed.allow_deletions.enabled).toBe(false);
		expect(parsed.required_status_checks?.contexts).toEqual([
			'ci-complete',
		]);
	});

	it('rejects a response missing allow_deletions (contract check)', () => {
		const { allow_deletions: _omit, ...rest } = LIVE_MAIN_RESPONSE;
		expect(() => parseGitHubBranchProtectionResponse(rest)).toThrow();
	});

	it('rejects the old singular allow_deletion field name — it is not the same field', () => {
		const wrongName = {
			...LIVE_MAIN_RESPONSE,
			allow_deletion: { enabled: false },
		};
		// @ts-expect-error deliberately testing the field-name typo
		delete wrongName.allow_deletions;
		expect(() => parseGitHubBranchProtectionResponse(wrongName)).toThrow();
	});

	it('accepts required_status_checks: null (protected branch, no required checks)', () => {
		const parsed = parseGitHubBranchProtectionResponse({
			...LIVE_MAIN_RESPONSE,
			required_status_checks: null,
		});
		expect(parsed.required_status_checks).toBeNull();
	});
});

describe('fetchBranchProtection', () => {
	it('returns unprotected on 404', async () => {
		stubFetch(async () => jsonResponse({ message: 'Not Found' }, 404));
		const result = await fetchBranchProtection({
			repo: 'foo/bar',
			branch: 'develop',
			token: undefined,
			tokenExplicit: false,
		});
		expect(result).toEqual({ kind: 'unprotected' });
	});

	it('returns unverified on 403 without an explicit token', async () => {
		stubFetch(async () =>
			jsonResponse(
				{ message: 'Resource not accessible by integration' },
				403,
			),
		);
		const result = await fetchBranchProtection({
			repo: 'foo/bar',
			branch: 'main',
			token: 'ambient-github-token',
			tokenExplicit: false,
		});
		expect(result).toEqual({ kind: 'unverified', branch: 'main' });
	});

	it('returns unverified on 401 without an explicit token', async () => {
		stubFetch(async () =>
			jsonResponse({ message: 'Bad credentials' }, 401),
		);
		const result = await fetchBranchProtection({
			repo: 'foo/bar',
			branch: 'main',
			token: undefined,
			tokenExplicit: false,
		});
		expect(result.kind).toBe('unverified');
	});

	it('throws GitHubProtectionAuthError on 403 WITH an explicit token', async () => {
		stubFetch(async () =>
			jsonResponse(
				{ message: 'Resource not accessible by integration' },
				403,
			),
		);
		await expect(
			fetchBranchProtection({
				repo: 'foo/bar',
				branch: 'main',
				token: 'a-deliberately-configured-pat',
				tokenExplicit: true,
			}),
		).rejects.toBeInstanceOf(GitHubProtectionAuthError);
	});

	it('returns the live, parsed data on 200', async () => {
		stubFetch(async () => jsonResponse(LIVE_MAIN_RESPONSE));
		const result = await fetchBranchProtection({
			repo: 'foo/bar',
			branch: 'main',
			token: 'token',
			tokenExplicit: true,
		});
		expect(result.kind).toBe('live');
		if (result.kind === 'live') {
			expect(result.data.allow_deletions.enabled).toBe(false);
		}
	});

	it('throws a generic error on an unexpected status', async () => {
		stubFetch(async () => jsonResponse({ message: 'oops' }, 500));
		await expect(
			fetchBranchProtection({
				repo: 'foo/bar',
				branch: 'main',
				token: undefined,
				tokenExplicit: false,
			}),
		).rejects.toThrow(/GitHub API 500/);
	});
});

describe('reportUnverifiedBranches + appendGitHubStepSummary', () => {
	let dir: string | undefined;

	afterEach(async () => {
		if (dir !== undefined) await rm(dir, { recursive: true, force: true });
		dir = undefined;
	});

	it('is a no-op when there are no unverified branches', async () => {
		await expect(
			reportUnverifiedBranches('verify-x', []),
		).resolves.toBeUndefined();
	});

	it('writes a ::warning:: and a $GITHUB_STEP_SUMMARY line naming the branch', async () => {
		dir = await mkdtemp(join(tmpdir(), 'gh-step-summary-'));
		const summaryPath = join(dir, 'summary.md');
		process.env.GITHUB_STEP_SUMMARY = summaryPath;

		const chunks: string[] = [];
		const originalWrite = process.stdout.write.bind(process.stdout);
		process.stdout.write = (chunk: string) => {
			chunks.push(chunk);
			return true;
		};
		try {
			await reportUnverifiedBranches('verify-branch-protection', [
				'develop',
				'main',
			]);
		} finally {
			process.stdout.write = originalWrite;
		}

		expect(chunks.join('')).toContain('::warning::');
		expect(chunks.join('')).toContain('develop, main');

		const summary = await readFile(summaryPath, 'utf8');
		expect(summary).toContain('develop, main');
	});

	it('appendGitHubStepSummary is a no-op when GITHUB_STEP_SUMMARY is unset', async () => {
		delete process.env.GITHUB_STEP_SUMMARY;
		await expect(appendGitHubStepSummary('hello')).resolves.toBeUndefined();
	});
});

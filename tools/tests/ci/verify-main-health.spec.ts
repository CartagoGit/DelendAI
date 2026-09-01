import { describe, expect, it } from 'vitest';

import {
	diffDeclaredProtection,
	main as verifyMainHealth,
} from '../../scripts/ci/verify-main-health.script.ts';
import type { IDeclaredBranchPolicy } from '../../scripts/ci/verify-branch-protection.script.ts';

const originalFetch = globalThis.fetch;

const MAIN_POLICY: IDeclaredBranchPolicy = {
	name: 'main',
	protected: true,
	protection: {
		required_status_checks: {
			strict: true,
			contexts: ['ci-complete', 'release-pr-gate'],
		},
		enforce_admins: true,
		required_linear_history: true,
		allow_force_pushes: false,
		allow_deletions: false,
		restrictions: null,
	},
};

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

const MAIN_GREEN_CHECK_RUNS = {
	check_runs: [
		{
			id: 101,
			name: 'ci-complete',
			status: 'completed',
			conclusion: 'success',
			head_sha: 'mainsha',
			html_url: 'https://example.test/checks/101',
		},
		{
			id: 102,
			name: 'release-pr-gate',
			status: 'completed',
			conclusion: 'success',
			head_sha: 'mainsha',
			html_url: 'https://example.test/checks/102',
		},
	],
};

const MAIN_RED_CHECK_RUNS = {
	check_runs: [
		{
			id: 101,
			name: 'ci-complete',
			status: 'completed',
			conclusion: 'failure',
			head_sha: 'mainsha',
			html_url: 'https://example.test/checks/101',
		},
		{
			id: 102,
			name: 'release-pr-gate',
			status: 'completed',
			conclusion: 'success',
			head_sha: 'mainsha',
			html_url: 'https://example.test/checks/102',
		},
	],
};

const DEVELOP_RED_CHECK_RUNS = {
	check_runs: [
		{
			id: 201,
			name: 'smoke',
			status: 'completed',
			conclusion: 'failure',
			head_sha: 'developsha',
			html_url: 'https://example.test/checks/201',
		},
	],
};

const DEVELOP_GREEN_CHECK_RUNS = {
	check_runs: [
		{
			id: 202,
			name: 'smoke',
			status: 'completed',
			conclusion: 'success',
			head_sha: 'developsha',
			html_url: 'https://example.test/checks/202',
		},
	],
};

const jsonResponse = (body: unknown, status = 200): Response =>
	new Response(JSON.stringify(body), {
		status,
		headers: { 'content-type': 'application/json' },
	});

const stubFetch = (impl: (url: string) => Promise<Response>): void => {
	globalThis.fetch = impl as typeof fetch;
};

const restoreFetch = (): void => {
	globalThis.fetch = originalFetch;
};

describe('diffDeclaredProtection', () => {
	it('produces a readable diff when a required check is missing', () => {
		const diff = diffDeclaredProtection(
			MAIN_POLICY,
			{
				...LIVE_MAIN_FIXTURE,
				required_status_checks: {
					strict: true,
					contexts: ['ci-complete'],
				},
			},
			true,
		);
		expect(diff).toContain(
			'main: missing required status check "release-pr-gate"',
		);
	});
});

describe('verify-main-health', () => {
	it('returns exit 0 when main is green and protected', async () => {
		stubFetch(async (url) => {
			const value = url.toString();
			if (value.includes('/branches/main/protection')) {
				return jsonResponse(LIVE_MAIN_FIXTURE);
			}
			if (value.includes('/branches/develop/protection')) {
				return jsonResponse({ message: 'Not Found' }, 404);
			}
			if (value.includes('/commits/main/check-runs')) {
				return jsonResponse(MAIN_GREEN_CHECK_RUNS);
			}
			if (value.includes('/commits/develop/check-runs')) {
				return jsonResponse(DEVELOP_GREEN_CHECK_RUNS);
			}
			return jsonResponse({ message: 'Not Found' }, 404);
		});
		try {
			const code = await verifyMainHealth(['--repo', 'foo/bar']);
			expect(code).toBe(0);
		} finally {
			restoreFetch();
		}
	});

	it('returns exit 1 when main required checks are red', async () => {
		stubFetch(async (url) => {
			const value = url.toString();
			if (value.includes('/branches/main/protection')) {
				return jsonResponse(LIVE_MAIN_FIXTURE);
			}
			if (value.includes('/branches/develop/protection')) {
				return jsonResponse({ message: 'Not Found' }, 404);
			}
			if (value.includes('/commits/main/check-runs')) {
				return jsonResponse(MAIN_RED_CHECK_RUNS);
			}
			if (value.includes('/commits/develop/check-runs')) {
				return jsonResponse(DEVELOP_GREEN_CHECK_RUNS);
			}
			return jsonResponse({ message: 'Not Found' }, 404);
		});
		try {
			const code = await verifyMainHealth(['--repo', 'foo/bar']);
			expect(code).toBe(1);
		} finally {
			restoreFetch();
		}
	});

	it('returns exit 1 when main protection diverges from the declared YAML', async () => {
		stubFetch(async (url) => {
			const value = url.toString();
			if (value.includes('/branches/main/protection')) {
				return jsonResponse({
					...LIVE_MAIN_FIXTURE,
					required_status_checks: {
						strict: true,
						contexts: ['ci-complete'],
					},
				});
			}
			if (value.includes('/branches/develop/protection')) {
				return jsonResponse({ message: 'Not Found' }, 404);
			}
			if (value.includes('/commits/main/check-runs')) {
				return jsonResponse(MAIN_GREEN_CHECK_RUNS);
			}
			if (value.includes('/commits/develop/check-runs')) {
				return jsonResponse(DEVELOP_GREEN_CHECK_RUNS);
			}
			return jsonResponse({ message: 'Not Found' }, 404);
		});
		try {
			const code = await verifyMainHealth(['--repo', 'foo/bar']);
			expect(code).toBe(1);
		} finally {
			restoreFetch();
		}
	});

	it('returns exit 0 when develop is red but main is healthy', async () => {
		stubFetch(async (url) => {
			const value = url.toString();
			if (value.includes('/branches/main/protection')) {
				return jsonResponse(LIVE_MAIN_FIXTURE);
			}
			if (value.includes('/branches/develop/protection')) {
				return jsonResponse({ message: 'Not Found' }, 404);
			}
			if (value.includes('/commits/main/check-runs')) {
				return jsonResponse(MAIN_GREEN_CHECK_RUNS);
			}
			if (value.includes('/commits/develop/check-runs')) {
				return jsonResponse(DEVELOP_RED_CHECK_RUNS);
			}
			return jsonResponse({ message: 'Not Found' }, 404);
		});
		try {
			const code = await verifyMainHealth(['--repo', 'foo/bar']);
			expect(code).toBe(0);
		} finally {
			restoreFetch();
		}
	});
});

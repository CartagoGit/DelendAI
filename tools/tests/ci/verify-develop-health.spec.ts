/**
 * verify-develop-health.spec.ts — covers v00125.
 *
 * Tests the report-shape logic with a mocked fetch. The real
 * GitHub API is exercised by the nightly CI job.
 */

import { describe, expect, it } from 'vitest';

// We import the module lazily inside each test so we can stub
// `fetch` per case.

const originalFetch = globalThis.fetch;

const stubFetch = (impl: (url: string) => Promise<Response>): void => {
	// @ts-expect-error mutating for test purposes only.
	globalThis.fetch = impl;
};

const restoreFetch = (): void => {
	globalThis.fetch = originalFetch;
};

const jsonResponse = (body: unknown, status = 200): Response =>
	new Response(JSON.stringify(body), {
		status,
		headers: { 'content-type': 'application/json' },
	});

describe('verify-develop-health (v00125)', () => {
	it('refuses without --repo', async () => {
		const { main } = await import(
			'../../scripts/ci/verify-develop-health.script'
		);
		const code = await main([]);
		expect(code).toBe(2);
	});

	it('returns healthy=true when every branch matches', async () => {
		stubFetch(async (url) => {
			const healthy = {
				enforce_admins: { enabled: true },
				required_linear_history: { enabled: true },
				allow_force_pushes: { enabled: false },
				allow_deletion: { enabled: false },
				required_status_checks: {
					strict: true,
					contexts: ['ci-complete'],
				},
			};
			// The policy is asymmetric: `develop` is the working branch and
			// is declared unprotected, so "no rule" is its healthy state.
			// Only `main` is expected to carry protection.
			if (url.includes('/branches/main/protection'))
				return jsonResponse(healthy);
			return jsonResponse({ message: 'not found' }, 404);
		});
		try {
			const { main } = await import(
				'../../scripts/ci/verify-develop-health.script'
			);
			const code = await main(['--repo', 'foo/bar', '--dry-run']);
			expect(code).toBe(0);
		} finally {
			restoreFetch();
		}
	});

	it('returns healthy=false when a required check is missing', async () => {
		stubFetch(async (url) => {
			const unhealthy = {
				enforce_admins: { enabled: true },
				required_linear_history: { enabled: true },
				allow_force_pushes: { enabled: false },
				allow_deletion: { enabled: false },
				required_status_checks: {
					strict: true,
					contexts: ['lint-biome'], // not `ci-complete` — the required check is missing
				},
			};
			if (url.includes('/branches/main/protection'))
				return jsonResponse(unhealthy);
			return jsonResponse({ message: 'not found' }, 404);
		});
		try {
			const { main } = await import(
				'../../scripts/ci/verify-develop-health.script'
			);
			const code = await main(['--repo', 'foo/bar', '--dry-run']);
			expect(code).toBe(1);
		} finally {
			restoreFetch();
		}
	});

	it('returns healthy=false when the protected branch has no rule', async () => {
		// 404 everywhere: fine for `develop`, drift for `main`.
		stubFetch(async () => jsonResponse({ message: 'Not Found' }, 404));
		try {
			const { main } = await import(
				'../../scripts/ci/verify-develop-health.script'
			);
			const code = await main(['--repo', 'foo/bar', '--dry-run']);
			expect(code).toBe(1);
		} finally {
			restoreFetch();
		}
	});
});

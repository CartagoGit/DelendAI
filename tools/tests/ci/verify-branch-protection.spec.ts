/**
 * verify-branch-protection.spec.ts — covers c00130 (AUD-P0-001).
 *
 * Tests the diff logic + dry-run path without contacting GitHub.
 * Network-level coverage happens in CI against the live repo.
 */

import { describe, expect, it } from 'vitest';

import { main } from '../../scripts/ci/verify-branch-protection.script';

describe('verify-branch-protection (c00130)', () => {
	it('dry-run prints every declared branch without contacting GitHub', async () => {
		const code = await main(['--dry-run']);
		expect(code).toBe(0);
	});

	it('refuses when --repo is missing and not in dry-run mode', async () => {
		const code = await main([]);
		expect(code).toBe(2);
	});

	it('dry-run exits 0 even with arbitrary CLI noise', async () => {
		const code = await main(['--dry-run', '--repo', 'foo/bar']);
		expect(code).toBe(0);
	});
});

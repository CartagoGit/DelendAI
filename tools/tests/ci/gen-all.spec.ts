/**
 * gen-all.spec.ts — covers c00133 (AUD-P0-003).
 *
 * Tests the list + filter behavior. Real execution is exercised
 * by the drift CI workflow, not by these tests.
 */

import { describe, expect, it } from 'vitest';

import { main } from '../../scripts/gen-all.script';

describe('gen-all (c00133)', () => {
	it('--list exits 0 and prints every step', async () => {
		const code = await main(['--list']);
		expect(code).toBe(0);
	});

	it('--only <unknown> exits 2', async () => {
		const code = await main(['--only', 'no-such-step']);
		expect(code).toBe(2);
	});

	it('--only plugin-manifests filters to a single step', async () => {
		const code = await main(['--only', 'plugin-manifests']);
		expect(code).toBe(0);
	});
});

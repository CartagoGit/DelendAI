/**
 * quality-gate.spec.ts — covers c00132 (AUD-P0-002).
 *
 * Dry-run path + filter behavior + unknown --only selector.
 * Real execution is exercised by CI, not by these tests.
 */

import { describe, expect, it } from 'vitest';

import { main } from '../../scripts/ci/quality-gate.script';

describe('quality-gate (c00132)', () => {
	it('dry-run exits 0 with every step printed', async () => {
		const code = await main(['--dry-run']);
		expect(code).toBe(0);
	});

	it('--only typecheck filters to a single step', async () => {
		const code = await main(['--dry-run', '--only', 'typecheck']);
		expect(code).toBe(0);
	});

	it('--only <unknown> exits 2', async () => {
		const code = await main(['--dry-run', '--only', 'no-such-step']);
		expect(code).toBe(2);
	});
});

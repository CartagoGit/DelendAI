/**
 * no-node-imports.spec.ts — r00029 S1 acceptance.
 *
 * Runs the `no-node-imports-in-contracts` lint as a test so
 * `bun run validate` catches a regression immediately. The
 * standalone script is also wired into the validate pipeline.
 */

import { describe, expect, it } from 'vitest';

import { main as lintMain } from '../../../../tools/scripts/lint/no-node-imports-in-contracts.script';

describe('no-node-imports-in-contracts (r00029 S1)', () => {
	it('returns 0 violations for the current contracts surface', async () => {
		const code = await lintMain();
		expect(code).toBe(0);
	});
});

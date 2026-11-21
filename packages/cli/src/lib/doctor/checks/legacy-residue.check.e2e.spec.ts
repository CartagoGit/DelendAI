/**
 * legacy-residue.check.e2e.spec.ts — the default probe on this machine: it
 * reads the real home and lists the real processes, so it is not a unit test.
 */
import { describe, expect, it } from 'vitest';

import { defaultLegacyResidueProbe } from './legacy-residue.check';

describe('the default probe', () => {
	it('[<2000ms] reads this machine without writing and lists processes', async () => {
		const report = await defaultLegacyResidueProbe.scan('/ws');
		expect(Array.isArray(report.changes)).toBe(true);
		expect(Array.isArray(await defaultLegacyResidueProbe.processes())).toBe(
			true,
		);
	});
});

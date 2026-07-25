import { describe, expect, it } from 'vitest';

import { PLAYWRIGHT_INSTALL_HINT, probePlaywright } from './playwright-probe';

describe('playwright-probe (f00125 S1)', () => {
	it('returns a structured probe result', async () => {
		const r = await probePlaywright();
		if (r.available) {
			expect(r.available).toBe(true);
		} else {
			expect(r.available).toBe(false);
			expect(r.installHint).toContain('playwright');
		}
	});

	it('install hint names the package and the chromium step', () => {
		expect(PLAYWRIGHT_INSTALL_HINT).toContain(
			'playwright install chromium',
		);
	});
});

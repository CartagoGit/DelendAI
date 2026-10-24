import { describe, expect, it } from 'vitest';

import {
	USAGE_TRACKING_PLUGIN,
	assertUsageTrackingLoaded,
} from '../../../src/lib/guard';

describe('assertUsageTrackingLoaded (CRITICAL I15)', () => {
	it('passes when usage-tracking is in the loaded set', () => {
		expect(() =>
			assertUsageTrackingLoaded([USAGE_TRACKING_PLUGIN, 'proposals']),
		).not.toThrow();
	});

	it('throws a clear, actionable error when it is absent', () => {
		expect(() =>
			assertUsageTrackingLoaded(['proposals', 'memory']),
		).toThrow(/requires the "usage-tracking" plugin/);
		expect(() => assertUsageTrackingLoaded([])).toThrow(/CRITICAL I15/);
		// The message names the fix (how to load it).
		try {
			assertUsageTrackingLoaded([]);
		} catch (err) {
			expect((err as Error).message).toContain('--plugins=');
		}
	});
});

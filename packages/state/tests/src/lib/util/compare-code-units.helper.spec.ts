/**
 * compare-code-units.helper.spec.ts — a total, locale-free order.
 */
import { describe, expect, it } from 'vitest';

import { compareCodeUnits } from '../../../../src/lib/util/compare-code-units.helper';

describe('compareCodeUnits', () => {
	it('orders two keys localeCompare ties, the same way in both insertion orders', () => {
		expect('᧒'.localeCompare('౽')).toBe(0);
		expect(compareCodeUnits('᧒', '౽')).toBeGreaterThan(0);
		expect(['᧒', '౽'].sort(compareCodeUnits)).toEqual(
			['౽', '᧒'].sort(compareCodeUnits),
		);
	});

	it('is 0 only for equal strings, and antisymmetric', () => {
		expect(compareCodeUnits('a', 'a')).toBe(0);
		expect(compareCodeUnits('a', 'b')).toBe(-1);
		expect(compareCodeUnits('b', 'a')).toBe(1);
		expect(compareCodeUnits('B', 'a')).toBe(-1);
	});
});

import { describe, expect, it } from 'vitest';

import {
	computeWinRates,
	winRateMap,
} from '../../../../src/lib/calibrate/win-rates';
import type { IOutcomeRecord } from '../../../../src/lib/contracts/interfaces/calibration.interface';

const rec = (providerId: string, success: boolean): IOutcomeRecord => ({
	providerId,
	success,
});

describe('computeWinRates', () => {
	it('computes success ratio per provider, sorted best-first', () => {
		const rates = computeWinRates(
			[
				rec('a', true),
				rec('a', true),
				rec('a', false),
				rec('b', true),
				rec('b', true),
				rec('b', true),
			],
			3,
		);
		expect(rates.map((r) => r.providerId)).toEqual(['b', 'a']);
		expect(rates[0]).toMatchObject({ winRate: 1, samples: 3 });
		expect(rates[1]?.winRate).toBeCloseTo(2 / 3);
	});

	it('drops providers below the minimum sample threshold', () => {
		const rates = computeWinRates(
			[rec('a', true), rec('a', true), rec('b', true)],
			3,
		);
		expect(rates).toEqual([]);
	});
});

describe('winRateMap', () => {
	it('maps only providers with enough samples', () => {
		const map = winRateMap(
			[rec('a', true), rec('a', false), rec('a', true), rec('b', false)],
			3,
		);
		expect(map.get('a')).toBeCloseTo(2 / 3);
		expect(map.has('b')).toBe(false);
	});
});

import { describe, expect, it } from 'vitest';

import {
	median,
	medianOrUndefined,
	percentileLinear,
	percentileNearestRank,
} from './eta-aggregation';

describe('percentileNearestRank (f00511 S3)', () => {
	it('returns undefined on an empty sample', () => {
		expect(percentileNearestRank([], 0.8)).toBeUndefined();
	});

	it('returns the only value for a single sample', () => {
		expect(percentileNearestRank([42], 0)).toBe(42);
		expect(percentileNearestRank([42], 0.8)).toBe(42);
		expect(percentileNearestRank([42], 1)).toBe(42);
	});

	it('uses rank = ceil(q * n), 1-based, and always returns an observed value', () => {
		const samples = [10, 20, 30, 40, 50];
		// ceil(0.8 * 5) = 4 -> the 4th smallest.
		expect(percentileNearestRank(samples, 0.8)).toBe(40);
		// ceil(0.2 * 5) = 1 -> the smallest.
		expect(percentileNearestRank(samples, 0.2)).toBe(10);
		expect(percentileNearestRank(samples, 1)).toBe(50);
		// Never interpolates: every answer is a member of the sample.
		for (const q of [0, 0.1, 0.33, 0.5, 0.66, 0.9, 1]) {
			expect(samples).toContain(percentileNearestRank(samples, q));
		}
	});

	it('ignores input order and does not mutate the input', () => {
		const samples = [50, 10, 40, 20, 30];
		const copy = [...samples];
		expect(percentileNearestRank(samples, 0.8)).toBe(40);
		expect(samples).toEqual(copy);
	});

	it('clamps out-of-range quantiles', () => {
		const samples = [1, 2, 3];
		expect(percentileNearestRank(samples, -1)).toBe(1);
		expect(percentileNearestRank(samples, 5)).toBe(3);
		expect(percentileNearestRank(samples, Number.NaN)).toBe(1);
	});
});

describe('percentileLinear (f00511 S3)', () => {
	it('interpolates between the two neighbouring order statistics (R type-7)', () => {
		const samples = [10, 20, 30, 40];
		// h = (4-1)*0.5 = 1.5 -> 20 + 0.5 * (30-20) = 25
		expect(percentileLinear(samples, 0.5)).toBe(25);
		// h = 3*0.8 = 2.4 -> 30 + 0.4 * (40-30) = 34
		expect(percentileLinear(samples, 0.8)).toBeCloseTo(34, 10);
		expect(percentileLinear(samples, 0)).toBe(10);
		expect(percentileLinear(samples, 1)).toBe(40);
	});

	it('handles the empty and single-sample edges', () => {
		expect(percentileLinear([], 0.5)).toBeUndefined();
		expect(percentileLinear([7], 0.8)).toBe(7);
	});
});

describe('median (f00511 S3)', () => {
	it('is the middle value for an odd count', () => {
		expect(medianOrUndefined([30, 10, 20])).toBe(20);
		expect(medianOrUndefined([5])).toBe(5);
	});

	it('is the mean of the two central values for an even count', () => {
		// The boundary the reviewers asked for: the median falls
		// BETWEEN two observed values.
		expect(medianOrUndefined([10, 20, 30, 40])).toBe(25);
		expect(medianOrUndefined([1, 2])).toBe(1.5);
		expect(medianOrUndefined([1000, 1000, 3000, 5000])).toBe(2000);
	});

	it('is not the nearest-rank p50 on an even set', () => {
		const samples = [10, 20, 30, 40];
		expect(medianOrUndefined(samples)).toBe(25);
		expect(percentileNearestRank(samples, 0.5)).toBe(20);
	});

	it('returns undefined (or the 0 guard) on an empty sample', () => {
		expect(medianOrUndefined([])).toBeUndefined();
		expect(median([])).toBe(0);
	});
});

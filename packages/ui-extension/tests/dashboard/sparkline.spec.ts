import { describe, expect, it } from 'vitest';

import { sparklinePath } from '../../src/dashboard/sparkline';

describe('sparklinePath', () => {
	it('returns empty string for empty values', () => {
		expect(sparklinePath([], 100, 30)).toBe('');
	});

	it('returns a flat line for a single value', () => {
		const d = sparklinePath([5], 100, 30);
		expect(d).toContain('M 0');
		expect(d).toContain('L 100');
	});

	it('returns M then L segments for multiple values', () => {
		const d = sparklinePath([1, 2, 3, 4], 60, 30);
		const mCount = (d.match(/M /g) ?? []).length;
		const lCount = (d.match(/L /g) ?? []).length;
		expect(mCount).toBe(1);
		expect(lCount).toBe(3);
	});

	it('handles a constant series by collapsing to the midline', () => {
		const d = sparklinePath([7, 7, 7], 60, 30);
		// All y values must be identical.
		const ys = [...d.matchAll(/[ML] \d+(?:\.\d+)? (\d+(?:\.\d+)?)/g)].map(
			(m) => m[1],
		);
		expect(new Set(ys).size).toBe(1);
	});

	it('coerces NaN/Infinity to 0', () => {
		const d = sparklinePath(
			[Number.NaN, 1, Number.POSITIVE_INFINITY],
			60,
			30,
		);
		expect(d).not.toContain('NaN');
		expect(d).not.toContain('Infinity');
	});

	it('clamps to height when range = 0 (all values equal)', () => {
		const d = sparklinePath([5, 5, 5, 5], 60, 30);
		const ys = [...d.matchAll(/[ML] \d+(?:\.\d+)? (\d+(?:\.\d+)?)/g)].map(
			(m) => Number(m[1]),
		);
		expect(Math.max(...ys)).toBeLessThanOrEqual(30);
		expect(Math.min(...ys)).toBeGreaterThanOrEqual(0);
	});

	it('returns empty for non-positive width or height', () => {
		expect(sparklinePath([1, 2, 3], 0, 30)).toBe('');
		expect(sparklinePath([1, 2, 3], 60, 0)).toBe('');
	});

	it('inverts the y axis (max at top, min at bottom)', () => {
		const d = sparklinePath([0, 100], 60, 30);
		// First value should be near the bottom (large y), second near top (small y).
		const first = Number(/M \d+(?:\.\d+)? (\d+(?:\.\d+)?)/.exec(d)?.[1]);
		const last = Number(/L \d+(?:\.\d+)? (\d+(?:\.\d+)?)$/.exec(d)?.[1]);
		expect(first).toBeGreaterThan(last);
	});
});

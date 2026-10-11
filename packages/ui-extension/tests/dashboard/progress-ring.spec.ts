import { describe, expect, it } from 'vitest';

import { progressRing } from '../../src/dashboard/progress-ring';

describe('progressRing', () => {
	it('returns an empty path for zero values', () => {
		expect(progressRing(0, 100, 64)).toBe('');
	});

	it('returns a closed loop when ratio reaches 100%', () => {
		const path = progressRing(100, 100, 64);
		expect(path).toContain('A 28 28');
		expect(path).toContain('Z');
	});

	it("starts at 12 o'clock for the smallest non-zero value", () => {
		const path = progressRing(5, 100, 64);
		// 12 o'clock = (cx, cy - radius) = (32, 4)
		expect(path.startsWith('M 32 4')).toBe(true);
	});

	it('switches the large-arc flag above 50% ratio', () => {
		const path = progressRing(75, 100, 64);
		expect(path).toContain('A 28 28 0 1 1');
	});

	it('keeps the large-arc flag at 0 below 50% ratio', () => {
		const path = progressRing(25, 100, 64);
		expect(path).toContain('A 28 28 0 0 1');
	});

	it("ends near 3 o'clock at 25% (one quarter of the circle)", () => {
		const path = progressRing(25, 100, 64);
		// 3 o'clock = (cx + radius, cy) = (60, 32). At exactly 25% the end
		// is precisely at (60, 32).
		const match = path.match(/A 28 28 0 0 1 ([\d.-]+) ([\d.-]+)$/);
		expect(match).not.toBeNull();
		const endX = Number(match?.[1]);
		const endY = Number(match?.[2]);
		expect(Math.abs(endX - 60)).toBeLessThan(1);
		expect(Math.abs(endY - 32)).toBeLessThan(1);
	});

	it("ends near 9 o'clock at 75%", () => {
		const path = progressRing(75, 100, 64);
		const match = path.match(/A 28 28 0 1 1 ([\d.-]+) ([\d.-]+)$/);
		expect(match).not.toBeNull();
		const endX = Number(match?.[1]);
		const endY = Number(match?.[2]);
		// 9 o'clock = (cx - radius, cy) = (4, 32). EndX near 4, endY near 32.
		expect(Math.abs(endX - 4)).toBeLessThan(2);
		expect(Math.abs(endY - 32)).toBeLessThan(2);
	});

	it('clamps values above the max to a full ring', () => {
		const path = progressRing(150, 100, 64);
		expect(path).toContain('A 28 28');
		expect(path).toContain('Z');
	});

	it('coerces NaN into an empty path', () => {
		expect(progressRing(NaN, 100, 64)).toBe('');
	});

	it('coerces a zero max to 1', () => {
		expect(progressRing(0, 0, 64)).toBe('');
	});
});

import { describe, expect, it } from 'vitest';

import { progressRing } from '../../src/dashboard/progress-ring';

describe('progressRing', () => {
	it('returns an empty path for zero values', () => {
		expect(progressRing(0, 100, 64)).toBe('');
	});

	it('returns a closed loop when ratio reaches 100%', () => {
		const path = progressRing(100, 100, 64);
		expect(path).toContain('A 28 28');
		expect(path.split('A').length).toBe(3); // two arcs joined
	});

	it('returns a single arc below 50% ratio', () => {
		const path = progressRing(25, 100, 64);
		expect(path).toContain('M');
		expect(path).toContain('A 28 28 0 0 1');
	});

	it('switches the large-arc flag above 50% ratio', () => {
		const path = progressRing(75, 100, 64);
		expect(path).toContain('A 28 28 0 1 1');
	});

	it('clamps values above the max to a full ring', () => {
		const path = progressRing(150, 100, 64);
		expect(path).toContain('A 28 28');
		expect(path.split('A').length).toBe(3);
	});

	it('coerces NaN into an empty path', () => {
		expect(progressRing(NaN, 100, 64)).toBe('');
	});

	it('coerces a zero max to 1', () => {
		const path = progressRing(0, 0, 64);
		expect(path).toBe('');
	});
});

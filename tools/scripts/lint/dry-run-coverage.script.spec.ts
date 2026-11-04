import { describe, expect, it } from 'vitest';

import { countUnpreviewable, growthOf } from './dry-run-coverage.script';

describe('dry-run-coverage', () => {
	it('counts effectful registrations without dryRun support', () => {
		expect(countUnpreviewable("effects: ['write'],")).toBe(1);
		expect(
			countUnpreviewable("effects: ['write'], dryRunSupported: true,"),
		).toBe(0);
		expect(countUnpreviewable('effects: [],')).toBe(0);
	});

	it('fails only a new or larger count', () => {
		expect(growthOf({ a: 2 }, { a: 2 })).toEqual([]);
		expect(growthOf({ a: 1 }, { a: 2 })).toEqual([]);
		expect(growthOf({ a: 3 }, { a: 2 })).toHaveLength(1);
		expect(growthOf({ b: 1 }, {})).toHaveLength(1);
	});
});

import { describe, expect, it } from 'vitest';

import { budgetFailure, budgetInName } from '../../../src/public/index';

describe('time budget', () => {
	it('[<50ms] reads the maximum from the front of the name', () => {
		expect(budgetInName('[<9ms] x')).toBe(9);
		expect(budgetInName('[<2.5ms] fraction')).toBe(2.5);
		expect(budgetInName('x')).toBeUndefined();
		expect(budgetInName('[<ms] malformed')).toBeUndefined();
		expect(budgetInName('does [<9ms] later')).toBeUndefined();
	});

	it('[<20ms] fails a test with no budget, or a malformed one, unless its file is migrating', () => {
		const bare = { name: 'x', tookMs: 1 };
		expect(budgetFailure({ ...bare, migrating: false })).toContain(
			'no time budget',
		);
		expect(
			budgetFailure({ name: '[<ms] x', tookMs: 1, migrating: false }),
		).toContain('malformed time budget');
		expect(budgetFailure({ ...bare, migrating: true })).toBeUndefined();
	});

	it('[<20ms] fails a test over its budget and passes one within it, with no multiplier', () => {
		const seven = { name: '[<7ms] x', migrating: true };
		expect(budgetFailure({ ...seven, tookMs: 7 })).toBeUndefined();
		expect(budgetFailure({ ...seven, tookMs: 10 })).toContain(
			'over its declared budget of 7 ms',
		);
		expect(
			budgetFailure({ ...seven, migrating: false, tookMs: 10 }),
		).toContain('10.0 ms');
	});
});

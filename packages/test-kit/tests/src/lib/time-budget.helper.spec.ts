import { describe, expect, it } from 'vitest';

import {
	budgetFailure,
	budgetInName,
	budgetOf,
	labelled,
} from '../../../src/public/index';

describe('time budget', () => {
	it('reads the maximum from the metadata first, then from the name', {
		meta: { budgetMs: 50 },
	}, () => {
		expect(budgetOf('x', { budgetMs: 7 })).toBe(7);
		expect(budgetOf('[<9ms] x', {})).toBe(9);
		expect(budgetOf('x', {})).toBeUndefined();
		expect(budgetInName('[<2.5ms] fraction')).toBe(2.5);
		expect(budgetInName('[<ms] malformed')).toBeUndefined();
	});

	it('writes the prefix once and never doubles it', {
		meta: { budgetMs: 5 },
	}, () => {
		expect(labelled('does X', 7)).toBe('[<7ms] does X');
		expect(labelled('[<7ms] does X', 7)).toBe('[<7ms] does X');
	});

	it('fails a test that has no budget unless its file is migrating', {
		meta: { budgetMs: 5 },
	}, () => {
		const bare = { name: 'x', meta: {}, tookMs: 1 };
		expect(budgetFailure({ ...bare, migrating: false })).toContain(
			'no time budget',
		);
		expect(budgetFailure({ ...bare, migrating: true })).toBeUndefined();
	});

	it('fails a test over its budget and passes one within it, with no multiplier', {
		meta: { budgetMs: 5 },
	}, () => {
		const seven = { name: 'x', meta: { budgetMs: 7 }, migrating: true };
		expect(budgetFailure({ ...seven, tookMs: 7 })).toBeUndefined();
		expect(budgetFailure({ ...seven, tookMs: 10 })).toContain(
			'over its declared budget of 7 ms',
		);
		expect(
			budgetFailure({ ...seven, migrating: false, tookMs: 10 }),
		).toContain('10.0 ms');
	});
});

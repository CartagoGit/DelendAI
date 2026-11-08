import { describe, expect, it } from 'vitest';

import {
	budgetFailure,
	budgetInName,
	budgetOverrun,
	isWholeSuiteRun,
	mayGoUnbudgeted,
} from '../../../src/public/index';

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

	it('[<20ms] lets a file go unbudgeted when it is listed or the change leaves it alone, never when the change is unknown', () => {
		const listed = new Set(['old.spec.ts']);
		const changed = new Set(['mine.spec.ts', 'old.spec.ts']);
		expect(mayGoUnbudgeted('old.spec.ts', listed, changed)).toBe(true);
		expect(mayGoUnbudgeted('theirs.spec.ts', listed, changed)).toBe(true);
		expect(mayGoUnbudgeted('mine.spec.ts', listed, changed)).toBe(false);
		expect(mayGoUnbudgeted('theirs.spec.ts', listed, undefined)).toBe(
			false,
		);
		expect(mayGoUnbudgeted('old.spec.ts', listed, undefined)).toBe(true);
	});

	it('[<20ms] reports an overrun instead of failing it on a soft run, and still fails a missing budget', () => {
		const over = { name: '[<7ms] x', migrating: false, tookMs: 10 };
		expect(budgetFailure(over)).toContain('over its declared budget');
		expect(budgetFailure({ ...over, softOverrun: true })).toBeUndefined();
		expect(budgetOverrun({ ...over, softOverrun: true })).toContain(
			'10.0 ms',
		);
		expect(
			budgetFailure({
				name: 'x',
				migrating: false,
				tookMs: 1,
				softOverrun: true,
			}),
		).toContain('no time budget');
	});

	it('[<20ms] takes a command line with no filter or 200 specs as the whole suite, and a named few as bounded', () => {
		const many = Array.from(
			{ length: 200 },
			(_, i) => `a${String(i)}.spec.ts`,
		);
		expect(isWholeSuiteRun(['node', 'vitest', 'run'])).toBe(true);
		expect(isWholeSuiteRun(['node', 'vitest', 'run', '--coverage'])).toBe(
			true,
		);
		expect(isWholeSuiteRun(['node', 'vitest', 'run', ...many])).toBe(true);
		expect(isWholeSuiteRun(['node', 'vitest', 'run', 'a.spec.ts'])).toBe(
			false,
		);
		expect(
			isWholeSuiteRun(['node', 'vitest', 'run', 'tools/scripts']),
		).toBe(false);
	});
});

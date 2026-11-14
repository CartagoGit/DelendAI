import { describe, expect, it } from 'vitest';

import {
	budgetFailure,
	budgetInName,
	budgetOverrun,
	freshBudgetsOfDiff,
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

	it('[<20ms] reads the budgets a diff adds, unescaped, by the file it changes', () => {
		const diff = [
			'diff --git a/a.spec.ts b/a.spec.ts',
			'--- a/a.spec.ts',
			'+++ b/a.spec.ts',
			"-\tit('[<9ms] old', () => {});",
			"+\tit('[<20ms] new', () => {});",
			"+\tit('[<5ms] can\\'t wait', () => {});",
			'+\tit(`[<7ms] plain`, () => {}); it("[<3ms] two", f);',
			'+++ /dev/null',
			"+\tit('[<4ms] gone', () => {});",
		].join('\n');
		expect(freshBudgetsOfDiff(diff)).toEqual([
			'a.spec.ts\t[<20ms] new',
			"a.spec.ts\t[<5ms] can't wait",
			'a.spec.ts\t[<7ms] plain',
			'a.spec.ts\t[<3ms] two',
		]);
	});

	it('[<20ms] lets a fresh budget overrun pass, and still fails a missing one', () => {
		const over = { name: '[<5ms] x', migrating: false, tookMs: 9 };
		expect(budgetFailure(over)).toContain('over its declared budget');
		expect(budgetFailure({ ...over, fresh: true })).toBeUndefined();
		expect(budgetOverrun({ ...over, fresh: true })).toContain('9.0 ms');
		expect(
			budgetFailure({
				name: 'x',
				migrating: false,
				tookMs: 1,
				fresh: true,
			}),
		).toContain('no time budget');
	});

	describe('the tiers', () => {
		const unit = (tookMs: number, name = '[<5ms] x') =>
			budgetFailure({ name, tookMs, migrating: false, tier: 'unit' });
		const e2e = (tookMs: number, loadFactor: number, name = '[<100ms] x') =>
			budgetFailure({
				name,
				tookMs,
				migrating: false,
				tier: 'e2e',
				loadFactor,
			});

		it('[<20ms] holds a unit test to 200 ms of real time and ignores the number in its name', () => {
			expect(unit(199)).toBeUndefined();
			expect(unit(150, 'no budget at all')).toBeUndefined();
			expect(unit(201)).toContain('unit tier');
			expect(unit(201)).toContain('200 ms limit');
			expect(unit(201)).toContain('load factor 1.00');
		});

		it('[<20ms] stretches an e2e budget by the load factor and names tier, limit, factor and time', () => {
			expect(e2e(150, 1.5)).toBeUndefined();
			const failure = e2e(151, 1.5);
			expect(failure).toContain('e2e tier');
			expect(failure).toContain('100 ms x load factor 1.50 = 150.0 ms');
			expect(failure).toContain('took 151.0 ms');
		});

		it('[<20ms] still asks an e2e test for its declaration', () => {
			expect(e2e(1, 1, 'no budget')).toContain('no time budget');
			expect(e2e(1, 1, '[<ms] x')).toContain('malformed time budget');
		});

		it('[<20ms] judges a migrating file, and a file with no known tier, by its name as before', () => {
			expect(
				budgetFailure({
					name: '[<5ms] x',
					tookMs: 100,
					migrating: true,
					tier: 'unit',
				}),
			).toContain('declared budget of 5 ms');
			expect(
				budgetFailure({
					name: '[<5ms] x',
					tookMs: 100,
					migrating: false,
				}),
			).toContain('declared budget of 5 ms');
		});

		it('[<20ms] only reports a unit overrun when told to', () => {
			expect(
				budgetFailure({
					name: 'x',
					tookMs: 500,
					migrating: false,
					tier: 'unit',
					softOverrun: true,
				}),
			).toBeUndefined();
			expect(
				budgetOverrun({
					name: 'x',
					tookMs: 500,
					migrating: false,
					tier: 'unit',
				}),
			).toContain('unit tier');
		});
	});
});

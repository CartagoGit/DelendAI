import { describe, expect, it, vi } from 'vitest';

import {
	budgetFailure,
	budgetInName,
	budgetNoise,
	budgetOverrun,
	freshBudgetsOfDiff,
	mayGoUnbudgeted,
	withRemeasuredLoad,
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

		const e2eCase = (tookMs: number, loadFactor: number) => ({
			name: '[<100ms] x',
			tookMs,
			migrating: false,
			tier: 'e2e' as const,
			loadFactor,
		});

		it('[<20ms] passes and reports an e2e overrun within the noise headroom', () => {
			expect(e2e(140, 1)).toBeUndefined();
			expect(budgetNoise(e2eCase(140, 1))).toContain('within the noise');
			expect(budgetNoise(e2eCase(90, 1))).toBeUndefined();
		});

		it('[<20ms] fails an e2e overrun above the headroom and names time, budget, factor and headroom', () => {
			const failure = e2e(210, 1);
			expect(failure).toContain('e2e tier');
			expect(failure).toContain('took 210.0 ms');
			expect(failure).toContain('100 ms');
			expect(failure).toContain('load factor 1.00');
			expect(failure).toContain('noise headroom 2');
			expect(budgetNoise(e2eCase(210, 1))).toBeUndefined();
		});

		it('[<20ms] scales both e2e limits by the load factor', () => {
			expect(e2e(300, 1.5)).toBeUndefined();
			expect(e2e(301, 1.5)).toContain('= 300.0 ms');
			expect(budgetNoise(e2eCase(151, 1.5))).toContain(
				'fails above 300.0',
			);
			expect(budgetNoise(e2eCase(150, 1.5))).toBeUndefined();
		});

		describe('the load measured again when a test runs over', () => {
			const judge = (tookMs: number, start: number, now: number) => {
				const measure = vi.fn(() => now);
				const test = withRemeasuredLoad(
					{ ...e2eCase(tookMs, start) },
					measure,
				);
				return { measure, test };
			};

			it('[<20ms] reports as noise a test over at the start that is within at the re-measure', () => {
				const { measure, test } = judge(180, 1, 2);
				expect(measure).toHaveBeenCalledOnce();
				expect(budgetFailure(test)).toBeUndefined();
				const noise = budgetNoise(test);
				expect(noise).toContain('took 180.0 ms');
				expect(noise).toContain('1.00 at the start');
				expect(noise).toContain('2.00 measured');
			});

			it('[<20ms] fails a test over at both and names both factors, the limit and the time', () => {
				const { test } = judge(450, 1, 2);
				const failure = budgetFailure(test);
				expect(failure).toContain('e2e tier');
				expect(failure).toContain('took 450.0 ms');
				expect(failure).toContain('1.00 at the start');
				expect(failure).toContain('2.00 measured');
				expect(failure).toContain('= 400.0 ms');
				expect(budgetNoise(test)).toBeUndefined();
			});

			it('[<20ms] never re-measures a test within its start budget, nor a unit test', () => {
				const { measure } = judge(100, 1, 4);
				expect(measure).not.toHaveBeenCalled();
				const unitMeasure = vi.fn(() => 4);
				withRemeasuredLoad(
					{ name: 'x', tookMs: 500, migrating: false, tier: 'unit' },
					unitMeasure,
				);
				expect(unitMeasure).not.toHaveBeenCalled();
			});

			it('[<20ms] keeps the start factor when the load is lighter now', () => {
				const { test } = judge(250, 2, 1);
				expect(test.loadFactor).toBe(2);
				expect(budgetFailure(test)).toBeUndefined();
			});
		});

		it('[<20ms] reports no noise for a unit test', () => {
			expect(
				budgetNoise({
					name: '[<5ms] x',
					tookMs: 150,
					migrating: false,
					tier: 'unit',
				}),
			).toBeUndefined();
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

		describe('an e2e test the change does or does not touch', () => {
			const over = {
				name: '[<100ms] x',
				tookMs: 500,
				migrating: false,
				tier: 'e2e' as const,
				loadFactor: 1,
				loadFactorAtStart: 1,
				loadFactorNow: 1,
			};

			it('[<20ms] fails a touched spec strictly, naming both factors', () => {
				const failure = budgetFailure(over);
				expect(failure).toContain('took 500.0 ms');
				expect(failure).toContain('1.00 at the start');
			});

			it('[<20ms] only reports an untouched spec, with time, budget and both factors', () => {
				const untouched = {
					...over,
					softOverrun: true,
					migrating: true,
				};
				expect(budgetFailure(untouched)).toBeUndefined();
				const reported = budgetOverrun(untouched);
				expect(reported).toContain('took 500.0 ms');
				expect(reported).toContain('100 ms');
				expect(reported).toContain('1.00 measured');
			});

			it('[<20ms] keeps a fresh budget on its strict reporting path', () => {
				expect(budgetFailure({ ...over, fresh: true })).toBeUndefined();
				expect(budgetOverrun({ ...over, fresh: true })).toContain(
					'e2e tier',
				);
			});
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

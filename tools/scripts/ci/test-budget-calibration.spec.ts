import { describe, expect, it } from 'vitest';

import {
	budgetChanges,
	calibratedBudget,
	longestDurations,
	parseFlatted,
	referenceOfDurations,
	requiredCorrection,
	withCalibratedBudget,
} from './test-budget-calibration';

describe('test budget calibration', () => {
	it('[<20ms] is 1.5 times the CI maximum, and at least 4 ms more than it', () => {
		expect(calibratedBudget(250.8)).toBe(377);
		expect(calibratedBudget(116.3)).toBe(175);
		expect(calibratedBudget(2)).toBe(6);
	});

	it('[<20ms] reads a flatted blob, shared nodes and all', () => {
		const text = JSON.stringify([
			{ files: '1', same: '1' },
			['2'],
			{ name: '3', n: 7 },
			'a',
		]);
		const root = parseFlatted(text) as { files: unknown[]; same: unknown };
		expect(root.files).toBe(root.same);
		expect(root.files[0]).toEqual({ name: 'a', n: 7 });
	});

	it('[<20ms] keeps the longest time of every run and lists the tests under it', () => {
		const first = longestDurations([
			{ file: 'a.e2e.spec.ts', name: '[<96ms] x', tookMs: 116.3 },
			{ file: 'a.e2e.spec.ts', name: '[<500ms] y', tookMs: 20 },
		]);
		const both = longestDurations(
			[{ file: 'a.e2e.spec.ts', name: '[<96ms] x', tookMs: 100 }],
			first,
		);
		expect(both['a.e2e.spec.ts']?.['[<96ms] x']).toBe(116.3);
		expect(budgetChanges(both)).toEqual([
			{
				file: 'a.e2e.spec.ts',
				name: '[<96ms] x',
				declared: 96,
				calibrated: 175,
				maxMs: 116.3,
			},
		]);
	});

	it('[<20ms] rewrites a budget in the source only when its name is there once', () => {
		const change = {
			file: 'a.e2e.spec.ts',
			name: '[<96ms] x',
			declared: 96,
			calibrated: 175,
			maxMs: 116.3,
		};
		expect(withCalibratedBudget("it('[<96ms] x', f)", change)).toBe(
			"it('[<175ms] x', f)",
		);
		expect(withCalibratedBudget('nothing', change)).toBeUndefined();
	});

	it('[<20ms] names the calibrated number a test over its budget must declare', () => {
		const [change] = budgetChanges({
			'a.e2e.spec.ts': { '[<24ms] x': 130 },
		});
		expect(change).toBeDefined();
		if (change === undefined) return;
		expect(requiredCorrection(change)).toBe(
			'a.e2e.spec.ts > [<24ms] x: CI measured 130 ms; declare [<195ms] (bun run test:budgets:calibrate --from-ci=<this run> --update).',
		);
		expect(budgetChanges({ 'a.e2e.spec.ts': { '[<24ms] x': 24 } })).toEqual(
			[],
		);
	});

	it('[<20ms] takes each time to the reference before keeping the longest, and the budget follows', () => {
		const durations = longestDurations([
			{
				file: 'a.e2e.spec.ts',
				name: '[<10ms] t',
				tookMs: 90,
				loadFactor: 3,
			},
			{
				file: 'a.e2e.spec.ts',
				name: '[<10ms] t',
				tookMs: 20,
				loadFactor: 1,
			},
		]);
		expect(durations['a.e2e.spec.ts']?.['[<10ms] t']).toBe(30);
		expect(budgetChanges(durations)[0]?.calibrated).toBe(45);
	});

	it('[<20ms] never writes a budget into a unit-tier file', () => {
		const durations = longestDurations([
			{ file: 'a.spec.ts', name: '[<10ms] t', tookMs: 90 },
		]);
		expect(budgetChanges(durations)).toEqual([]);
	});

	it('[<20ms] takes the reference from the median benchmark of the shards', () => {
		const measured = [50, 70, 60].map((benchMs) => ({
			file: 'a.e2e.spec.ts',
			name: '[<10ms] t',
			tookMs: 1,
			benchMs,
		}));
		expect(referenceOfDurations(longestDurations(measured))).toBe(60);
		expect(referenceOfDurations({})).toBeUndefined();
	});
});

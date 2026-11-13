import { describe, expect, it } from 'vitest';

import {
	budgetChanges,
	calibratedBudget,
	longestDurations,
	parseFlatted,
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
			{ file: 'a.spec.ts', name: '[<96ms] x', tookMs: 116.3 },
			{ file: 'a.spec.ts', name: '[<500ms] y', tookMs: 20 },
		]);
		const both = longestDurations(
			[{ file: 'a.spec.ts', name: '[<96ms] x', tookMs: 100 }],
			first,
		);
		expect(both['a.spec.ts']?.['[<96ms] x']).toBe(116.3);
		expect(budgetChanges(both)).toEqual([
			{
				file: 'a.spec.ts',
				name: '[<96ms] x',
				declared: 96,
				calibrated: 175,
				maxMs: 116.3,
			},
		]);
	});

	it('[<20ms] rewrites a budget in the source only when its name is there once', () => {
		const change = {
			file: 'a.spec.ts',
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
		const [change] = budgetChanges({ 'a.spec.ts': { '[<24ms] x': 130 } });
		expect(change).toBeDefined();
		if (change === undefined) return;
		expect(requiredCorrection(change)).toBe(
			'a.spec.ts > [<24ms] x: CI measured 130 ms; declare [<195ms] (bun run test:budgets:calibrate --from-ci=<this run> --update).',
		);
		expect(budgetChanges({ 'a.spec.ts': { '[<24ms] x': 24 } })).toEqual([]);
	});
});

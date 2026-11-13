import { describe, expect, it } from 'vitest';

import {
	isE2eSpec,
	loadFactorFromEnv,
	loadFactorOf,
} from '../../../src/lib/time-budget/time-budget-tier.helper';
import type { ILoadBenchmarkWork } from '../../../src/contracts/interfaces/load-benchmark.interface';
import { measureLoadBenchmark } from '../../../src/lib/time-budget/load-benchmark.helper';

describe('the budget tiers', () => {
	it('[<20ms] puts *.e2e.spec.ts and tests/e2e/ in the e2e tier and every other spec in the unit tier', () => {
		expect(isE2eSpec('a/b.e2e.spec.ts')).toBe(true);
		expect(isE2eSpec('tests/e2e/b.spec.ts')).toBe(true);
		expect(isE2eSpec('packages/x/tests/e2e/b.spec.ts')).toBe(true);
		expect(isE2eSpec('a/b.spec.ts')).toBe(false);
		expect(isE2eSpec('a/e2e-notes.spec.ts')).toBe(false);
	});

	it('[<20ms] clamps the load factor to 1..4, and reads an unusable measurement as no load', () => {
		expect(loadFactorOf(30, 60)).toBe(1);
		expect(loadFactorOf(90, 60)).toBe(1.5);
		expect(loadFactorOf(600, 60)).toBe(4);
		expect(loadFactorOf(Number.NaN, 60)).toBe(1);
		expect(loadFactorOf(90, 0)).toBe(1);
		expect(loadFactorFromEnv('2.5')).toBe(2.5);
		expect(loadFactorFromEnv('9')).toBe(4);
		expect(loadFactorFromEnv('0.2')).toBe(1);
		expect(loadFactorFromEnv(undefined)).toBe(1);
	});

	it('[<20ms] times a fixed pass of spawns and file work, and always cleans up', () => {
		const calls: string[] = [];
		let clock = 0;
		const work: ILoadBenchmarkWork = {
			now: () => {
				clock += 10;
				return clock;
			},
			spawn: () => calls.push('spawn'),
			writeAndRead: () => calls.push('file'),
			cleanup: () => calls.push('cleanup'),
		};
		expect(measureLoadBenchmark(work)).toBe(10);
		expect(calls.filter((call) => call === 'spawn').length).toBeGreaterThan(
			0,
		);
		expect(calls.at(-1)).toBe('cleanup');
		const failing: ILoadBenchmarkWork = {
			...work,
			spawn: () => {
				throw new Error('no git');
			},
		};
		calls.length = 0;
		expect(() => measureLoadBenchmark(failing)).toThrow('no git');
		expect(calls).toEqual(['cleanup']);
	});
});

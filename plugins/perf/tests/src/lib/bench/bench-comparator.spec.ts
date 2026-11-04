import { describe, expect, it } from 'vitest';

import {
	compareToBaseline,
	type IBenchmarkYaml,
} from '../../../../src/lib/bench/bench-comparator';
import type { IBenchResult } from '../../../../src/lib/bench/bench-runner';

describe('compareToBaseline', () => {
	it('flags a 20% regression when threshold is 0.1', () => {
		const baseline: IBenchmarkYaml = {
			entries: {
				alpha: { ops: 100 },
			},
		};
		const current: readonly IBenchResult[] = [
			{
				name: 'alpha',
				ops: 80,
				sampleCount: 5,
				meanMs: 12.5,
				p95Ms: 13,
			},
		];

		expect(compareToBaseline(baseline, current, 0.1)).toEqual([
			{
				name: 'alpha',
				baselineOps: 100,
				currentOps: 80,
				ratio: 0.8,
				threshold: 0.1,
			},
		]);
	});

	it('returns no regressions when all benches stay within threshold', () => {
		const baseline: IBenchmarkYaml = {
			entries: {
				alpha: { ops: 100 },
				beta: { ops: 50 },
			},
		};
		const current: readonly IBenchResult[] = [
			{
				name: 'alpha',
				ops: 95,
				sampleCount: 5,
				meanMs: 10.53,
				p95Ms: 11,
			},
			{
				name: 'beta',
				ops: 48,
				sampleCount: 5,
				meanMs: 20.83,
				p95Ms: 21,
			},
		];

		expect(compareToBaseline(baseline, current, 0.1)).toEqual([]);
	});
});

import { describe, expect, it } from 'vitest';

import {
	aggregateProgress,
	defaultWeight,
	sliceProgress,
	sliceWeight,
} from './progress-weighting.service';

describe('progress weighting', () => {
	it('weighs a slice as 1 + log2 of its criteria and 1 without any', () => {
		expect(defaultWeight(1)).toBe(1);
		expect(defaultWeight(8)).toBe(4);
		expect(defaultWeight(128)).toBe(8);
		expect(defaultWeight(0)).toBe(1);
	});

	it('respects an override only inside [0.1, 100]', () => {
		expect(sliceWeight({ acceptanceCount: 8, weight: 0.1 })).toBe(0.1);
		expect(sliceWeight({ acceptanceCount: 8, weight: 100 })).toBe(100);
		expect(sliceWeight({ acceptanceCount: 8, weight: 0.09 })).toBe(4);
		expect(sliceWeight({ acceptanceCount: 8, weight: 100.5 })).toBe(4);
		expect(sliceWeight({ acceptanceCount: 8, weight: Number.NaN })).toBe(4);
	});

	it('reports 100 for a done slice with no criteria and 0 when open', () => {
		expect(
			sliceProgress({
				acceptanceCount: 0,
				acceptanceDone: 0,
				status: 'done',
			}),
		).toBe(100);
		expect(
			sliceProgress({
				acceptanceCount: 0,
				acceptanceDone: 0,
				status: 'open',
			}),
		).toBe(0);
		expect(
			sliceProgress({
				acceptanceCount: 4,
				acceptanceDone: 1,
				status: 'in-progress',
			}),
		).toBe(25);
	});

	const slices = (progress: readonly number[]) =>
		[1, 4, 8].map((weight, i) => ({
			sliceId: `S${i + 1}`,
			progress: progress[i] ?? 0,
			weight,
		}));

	it('aggregates 1/4/8 as 100 when complete and 300/13 for 100/50/0', () => {
		expect(aggregateProgress(slices([100, 100, 100]))).toBe(100);
		expect(aggregateProgress(slices([100, 50, 0]))).toBeCloseTo(
			300 / 13,
			10,
		);
	});

	it('does not depend on the order slices arrive in', () => {
		const forward = slices([100, 50, 0]);
		expect(aggregateProgress([...forward].reverse())).toBe(
			aggregateProgress(forward),
		);
		expect(aggregateProgress([])).toBe(0);
	});
});

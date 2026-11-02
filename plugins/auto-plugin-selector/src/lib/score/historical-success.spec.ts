/**
 * historical-success.spec.ts — r00025 S3 acceptance: the historical-
 * success signal is pure, returns the neutral 0.5 when no data, and
 * gently shrinks toward 0.5 when the observation count is small.
 */
import { describe, expect, it } from 'vitest';

import { scoreHistoricalSuccess } from './historical-success';

describe('scoreHistoricalSuccess (r00025 S3)', () => {
	it('returns the neutral 0.5 on cold-start (no observation)', () => {
		expect(scoreHistoricalSuccess({ successRate: undefined })).toBe(0.5);
		expect(scoreHistoricalSuccess({ successRate: null })).toBe(0.5);
		expect(scoreHistoricalSuccess({})).toBe(0.5);
	});

	it('returns the neutral 0.5 when observedCalls is zero (warm but empty)', () => {
		expect(
			scoreHistoricalSuccess({ successRate: 1, observedCalls: 0 }),
		).toBe(0.5);
	});

	it('shrinks a single perfect observation toward 0.5 (mixed scenario)', () => {
		const score = scoreHistoricalSuccess({
			successRate: 1,
			observedCalls: 1,
		});
		expect(score).toBeGreaterThan(0.5);
		expect(score).toBeLessThan(0.6);
	});

	it('approaches the raw rate when observedCalls hits the confidence threshold', () => {
		const score = scoreHistoricalSuccess({
			successRate: 0.92,
			observedCalls: 1_000,
		});
		expect(score).toBeGreaterThan(0.9);
		expect(score).toBeLessThanOrEqual(1);
	});

	it('rewards a perfect but small sample less than a perfect large one', () => {
		const tiny = scoreHistoricalSuccess({
			successRate: 1,
			observedCalls: 2,
		});
		const big = scoreHistoricalSuccess({
			successRate: 1,
			observedCalls: 200,
		});
		expect(big).toBeGreaterThan(tiny);
	});

	it('penalises a low success rate below 0.5 (warm path)', () => {
		const score = scoreHistoricalSuccess({
			successRate: 0.2,
			observedCalls: 100,
		});
		expect(score).toBeLessThan(0.3);
	});

	it('rejects non-finite rates without bias', () => {
		expect(
			scoreHistoricalSuccess({
				successRate: Number.NaN,
				observedCalls: 5,
			}),
		).toBe(0.5);
	});

	it('is pure: same input always yields the same output', () => {
		const input = { successRate: 0.8, observedCalls: 30 };
		expect(scoreHistoricalSuccess(input)).toBe(
			scoreHistoricalSuccess(input),
		);
	});
});

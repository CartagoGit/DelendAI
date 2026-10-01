/**
 * latency-tax.spec.ts — r00025 S2 acceptance: the latency-tax
 * signal is pure, returns the neutral 0.5 when usage-tracking has
 * no observation yet, and monotonically decreases as p95 grows.
 */
import { describe, expect, it } from 'vitest';

import { scoreLatencyTax } from './latency-tax';

describe('scoreLatencyTax (r00025 S2)', () => {
	it('returns the neutral 0.5 on cold-start (no observation)', () => {
		expect(scoreLatencyTax({ p95LatencyMs: undefined })).toBe(0.5);
		expect(scoreLatencyTax({ p95LatencyMs: null })).toBe(0.5);
		expect(scoreLatencyTax({})).toBe(0.5);
	});

	it('returns the neutral 0.5 when observedCalls is zero (warm but empty)', () => {
		expect(scoreLatencyTax({ p95LatencyMs: 50, observedCalls: 0 })).toBe(
			0.5,
		);
	});

	it('rates a fast plugin close to 1 (warm path)', () => {
		const fast = scoreLatencyTax({ p95LatencyMs: 50, observedCalls: 100 });
		expect(fast).toBeGreaterThan(0.7);
		expect(fast).toBeLessThanOrEqual(1);
	});

	it('rates a slow plugin close to 0 (warm path, observed many times)', () => {
		const slow = scoreLatencyTax({
			p95LatencyMs: 2_500,
			observedCalls: 250,
		});
		expect(slow).toBeLessThan(0.5);
		expect(slow).toBeGreaterThanOrEqual(0);
	});

	it('rates a borderline plugin around 0.5 (mixed scenario)', () => {
		const borderline = scoreLatencyTax({
			p95LatencyMs: 1_000,
			observedCalls: 25,
		});
		expect(borderline).toBeGreaterThan(0.4);
		expect(borderline).toBeLessThan(0.6);
	});

	it('rejects non-finite or negative latency values without bias', () => {
		expect(
			scoreLatencyTax({ p95LatencyMs: Number.NaN, observedCalls: 5 }),
		).toBe(0.5);
		expect(scoreLatencyTax({ p95LatencyMs: -10, observedCalls: 5 })).toBe(
			0.5,
		);
	});

	it('clamps the output to the closed [0, 1] interval', () => {
		expect(
			scoreLatencyTax({ p95LatencyMs: 0, observedCalls: 1 }),
		).toBeLessThanOrEqual(1);
		expect(
			scoreLatencyTax({ p95LatencyMs: 9_999_999, observedCalls: 1 }),
		).toBeGreaterThanOrEqual(0);
	});

	it('is pure: same input always yields the same output', () => {
		const input = { p95LatencyMs: 300, observedCalls: 10 };
		expect(scoreLatencyTax(input)).toBe(scoreLatencyTax(input));
	});
});

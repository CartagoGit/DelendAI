import { describe, expect, it } from 'vitest';

import {
	computePayloadPercentile,
	createByteSamplePercentileRegistry,
	PayloadPercentileSchema,
} from '@delendai/core/lib/metrics/payload-percentile';

describe('computePayloadPercentile', () => {
	it('reports an explicit no-samples state for an empty input', () => {
		expect(computePayloadPercentile([])).toEqual({ hasSamples: false });
	});

	it('never coerces the no-samples state into a numeric zero', () => {
		const result = computePayloadPercentile([]);
		expect(result).not.toHaveProperty('p95PayloadBytes');
	});

	it('computes the nearest-rank p95 over an unsorted sample set', () => {
		const result = computePayloadPercentile([500, 100, 400, 200, 300]);
		expect(result).toEqual({ hasSamples: true, p95PayloadBytes: 500 });
	});

	it('treats a single sample as its own p95', () => {
		expect(computePayloadPercentile([42])).toEqual({
			hasSamples: true,
			p95PayloadBytes: 42,
		});
	});

	it('does not mutate the input array', () => {
		const samples = [300, 100, 200];
		computePayloadPercentile(samples);
		expect(samples).toEqual([300, 100, 200]);
	});
});

describe('PayloadPercentileSchema', () => {
	it('accepts the no-samples shape', () => {
		expect(
			PayloadPercentileSchema.safeParse({ hasSamples: false }).success,
		).toBe(true);
	});

	it('accepts a sampled shape with a finite non-negative byte count', () => {
		expect(
			PayloadPercentileSchema.safeParse({
				hasSamples: true,
				p95PayloadBytes: 128,
			}).success,
		).toBe(true);
	});

	it('rejects a sampled shape missing p95PayloadBytes', () => {
		expect(
			PayloadPercentileSchema.safeParse({ hasSamples: true }).success,
		).toBe(false);
	});

	it('rejects a negative byte count', () => {
		expect(
			PayloadPercentileSchema.safeParse({
				hasSamples: true,
				p95PayloadBytes: -1,
			}).success,
		).toBe(false);
	});
});

describe('createByteSamplePercentileRegistry', () => {
	it('starts in the no-samples state', () => {
		const registry = createByteSamplePercentileRegistry();
		expect(registry.sampleCount()).toBe(0);
		expect(registry.snapshotPercentile()).toEqual({ hasSamples: false });
	});

	it('tracks sample count and percentile as bytes are recorded', () => {
		const registry = createByteSamplePercentileRegistry();
		for (const bytes of [100, 200, 300, 400, 500]) {
			registry.record(bytes);
		}
		expect(registry.sampleCount()).toBe(5);
		expect(registry.snapshotPercentile()).toEqual({
			hasSamples: true,
			p95PayloadBytes: 500,
		});
	});

	it('reset() returns the registry to the no-samples state', () => {
		const registry = createByteSamplePercentileRegistry();
		registry.record(42);
		registry.reset();
		expect(registry.sampleCount()).toBe(0);
		expect(registry.snapshotPercentile()).toEqual({ hasSamples: false });
	});
});

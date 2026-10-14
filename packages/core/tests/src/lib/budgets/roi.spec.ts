#!/usr/bin/env bun
import { describe, expect, it } from 'vitest';

import {
	aggregateROI,
	computeROI,
	confidenceFor,
	type IRoiMeasurement,
	type IRoiValueLookup,
} from '../../../../src/lib/budgets/roi';

describe('computeROI (c00136)', () => {
	it('returns 0 when there are no successful calls', () => {
		expect(
			computeROI({
				successfulCalls: 0,
				schemaBytes: 100,
				responseTokens: 50,
				value: 5,
			}),
		).toBe(0);
	});

	it('returns 0 when value is non-positive', () => {
		expect(
			computeROI({
				successfulCalls: 5,
				schemaBytes: 100,
				responseTokens: 50,
				value: 0,
			}),
		).toBe(0);
	});

	it('returns 0 when the denominator is zero', () => {
		expect(
			computeROI({
				successfulCalls: 5,
				schemaBytes: 0,
				responseTokens: 0,
				value: 5,
			}),
		).toBe(0);
	});

	it('computes the documented formula (50 / 1500)', () => {
		// 10 calls × 5 value / (1000 bytes + 500 tokens) = 50/1500 ≈ 0.0333
		const r = computeROI({
			successfulCalls: 10,
			schemaBytes: 1_000,
			responseTokens: 500,
			value: 5,
		});
		expect(r).toBeCloseTo(0.0333, 3);
	});

	it('clamps negatives to zero (defensive)', () => {
		expect(
			computeROI({
				successfulCalls: -1,
				schemaBytes: 100,
				responseTokens: 50,
				value: 5,
			}),
		).toBe(0);
	});
});

describe('confidenceFor', () => {
	it('low for sample size < 10', () => {
		expect(confidenceFor(0)).toBe('low');
		expect(confidenceFor(9)).toBe('low');
	});
	it('medium for 10..99', () => {
		expect(confidenceFor(10)).toBe('medium');
		expect(confidenceFor(99)).toBe('medium');
	});
	it('high for 100+', () => {
		expect(confidenceFor(100)).toBe('high');
		expect(confidenceFor(1000)).toBe('high');
	});
});

describe('aggregateROI', () => {
	const lookup: IRoiValueLookup = {
		valueFor: (id) => (id === 'unknown' ? undefined : 5),
	};

	it('skips plugins with no declared value', () => {
		const out = aggregateROI(
			[
				{
					pluginId: 'unknown',
					successfulCalls: 50,
					schemaBytes: 100,
					responseTokens: 50,
				},
			],
			lookup,
		);
		expect(out).toHaveLength(0);
	});

	it('sums successfulCalls and picks max schemaBytes/responseTokens per plugin', () => {
		const measurements: IRoiMeasurement[] = [
			{
				pluginId: 'proposals',
				successfulCalls: 5,
				schemaBytes: 1_000,
				responseTokens: 200,
			},
			{
				pluginId: 'proposals',
				successfulCalls: 8,
				schemaBytes: 800,
				responseTokens: 600,
			},
		];
		const out = aggregateROI(measurements, lookup);
		expect(out).toHaveLength(1);
		const row = out[0]!;
		expect(row.pluginId).toBe('proposals');
		expect(row.sampleSize).toBe(13);
		expect(row.confidence).toBe('medium');
	});

	it('orders plugins by ROI descending', () => {
		const out = aggregateROI(
			[
				{
					pluginId: 'low',
					successfulCalls: 100,
					schemaBytes: 5_000,
					responseTokens: 1_000,
				},
				{
					pluginId: 'high',
					successfulCalls: 100,
					schemaBytes: 100,
					responseTokens: 100,
				},
			],
			{
				valueFor: () => 5,
			},
		);
		expect(out[0]?.pluginId).toBe('high');
		expect(out[1]?.pluginId).toBe('low');
		expect(out[0]!.roi).toBeGreaterThan(out[1]!.roi);
	});
});

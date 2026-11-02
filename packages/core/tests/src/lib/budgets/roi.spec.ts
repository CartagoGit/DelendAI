#!/usr/bin/env bun
import { describe, expect, it } from 'vitest';

import {
	aggregateROI,
	measurementsFromSnapshot,
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
		expect(out[0]).toMatchObject({
			pluginId: 'proposals',
			measured: true,
			sampleSize: 13,
			confidence: 'medium',
		});
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
		const [first, second] = out;
		expect(first?.measured && second?.measured).toBe(true);
		if (first?.measured === true && second?.measured === true)
			expect(first.roi).toBeGreaterThan(second.roi);
	});
});

describe('an unmeasured plugin', () => {
	it('has no ROI and sorts after every measured one', () => {
		const out = aggregateROI(
			[
				{
					pluginId: 'idle',
					successfulCalls: 0,
					schemaBytes: 10,
					responseTokens: 0,
				},
				{
					pluginId: 'busy',
					successfulCalls: 1,
					schemaBytes: 9_999,
					responseTokens: 9_999,
				},
			],
			{ valueFor: () => 5 },
		);
		expect(out).toEqual([
			expect.objectContaining({ pluginId: 'busy', measured: true }),
			{
				pluginId: 'idle',
				measured: false,
				reason: 'no-successful-calls',
			},
		]);
		expect(out[1]).not.toHaveProperty('roi');
		expect(out[1]).not.toHaveProperty('sampleSize');
	});
});

describe('measurementsFromSnapshot', () => {
	const figures = (calls: number, errors: number, tokens: number) => ({
		calls,
		errors,
		cost: { estimatedTokens: { estimatedTokens4B: tokens } },
	});

	it('sums successful calls and tokens per owner, schema bytes from the listing', () => {
		const out = measurementsFromSnapshot({
			tools: {
				delendai_proposals_a: figures(5, 1, 100),
				delendai_proposals_b: figures(2, 2, 40),
				delendai_overview: figures(3, 0, 30),
			},
			schemaBytesByOwner: new Map([
				['proposals', 2_000],
				['core', 500],
				['forge', 800],
			]),
			ownerOf: (tool) =>
				tool.startsWith('delendai_proposals_') ? 'proposals' : 'core',
		});
		expect(out).toEqual([
			{
				pluginId: 'proposals',
				successfulCalls: 4,
				schemaBytes: 2_000,
				responseTokens: 140,
			},
			{
				pluginId: 'core',
				successfulCalls: 3,
				schemaBytes: 500,
				responseTokens: 30,
			},
			{
				pluginId: 'forge',
				successfulCalls: 0,
				schemaBytes: 800,
				responseTokens: 0,
			},
		]);
	});

	it('counts a called tool the listing did not serve, at no schema bytes', () => {
		expect(
			measurementsFromSnapshot({
				tools: { x_tool: figures(1, 0, 4) },
				schemaBytesByOwner: new Map(),
				ownerOf: () => 'x',
			}),
		).toEqual([
			{
				pluginId: 'x',
				successfulCalls: 1,
				schemaBytes: 0,
				responseTokens: 4,
			},
		]);
	});
});

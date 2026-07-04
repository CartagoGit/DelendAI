/**
 * pricing.spec.ts — cost computation, subscription null, snapshot
 * fallback, and the non-blocking stale-while-revalidate refresh.
 */
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
	computeCostUsd,
	readBundledSnapshot,
	resolvePricing,
	type IPricingTable,
} from '../../../src/lib/pricing';

const table: IPricingTable = {
	updatedAt: new Date().toISOString(),
	source: 'test',
	models: {
		'gpt-4o': {
			kind: 'api',
			inputCostPer1k: 0.005,
			outputCostPer1k: 0.015,
		},
		'sub-model': {
			kind: 'subscription',
			subscriptionUsd: 20,
			marginalCostUsd: null,
			fixedCost: true,
		},
	},
};

describe('computeCostUsd', () => {
	it('computes cost from input/output tokens', () => {
		const cost = computeCostUsd(table, 'gpt-4o', {
			inputTokens: 1000,
			outputTokens: 1000,
		});
		expect(cost).toBeCloseTo(0.02, 6);
	});

	it('returns null for a subscription model (N4 — no fabricated price)', () => {
		expect(
			computeCostUsd(table, 'sub-model', {
				inputTokens: 1000,
				outputTokens: 1000,
			}),
		).toBeNull();
	});

	it('returns null for unknown model, absent usage, or zero tokens', () => {
		expect(computeCostUsd(table, 'nope', { inputTokens: 10 })).toBeNull();
		expect(computeCostUsd(table, 'gpt-4o', null)).toBeNull();
		expect(
			computeCostUsd(table, undefined, { inputTokens: 10 }),
		).toBeNull();
		expect(
			computeCostUsd(table, 'gpt-4o', {
				inputTokens: 0,
				outputTokens: 0,
			}),
		).toBeNull();
	});
});

describe('bundled snapshot', () => {
	it('ships a parseable snapshot with a subscription entry', async () => {
		const snap = await readBundledSnapshot();
		expect(Object.keys(snap.models).length).toBeGreaterThan(0);
		const sub = Object.values(snap.models).find(
			(m) => m.kind === 'subscription',
		);
		expect(sub).toBeDefined();
	});
});

describe('resolvePricing (stale-while-revalidate, non-blocking)', () => {
	let dir = '';
	beforeEach(() => {
		dir = mkdtempSync(join(tmpdir(), 'ut-price-'));
	});
	afterEach(() => rmSync(dir, { recursive: true, force: true }));

	it('falls back to the bundled snapshot when no cache exists', async () => {
		const resolved = await resolvePricing(join(dir, 'pricing.json'), {
			// A fetch impl that would hang — proves the resolve never awaits it.
			fetchImpl: () => new Promise(() => {}),
		});
		expect(Object.keys(resolved.models).length).toBeGreaterThan(0);
	});

	it('returns a fresh on-disk cache verbatim without refetching', async () => {
		const cachePath = join(dir, 'pricing.json');
		const fresh: IPricingTable = {
			updatedAt: new Date().toISOString(),
			source: 'cache',
			models: {
				'only-cached': {
					kind: 'api',
					inputCostPer1k: 1,
					outputCostPer1k: 2,
				},
			},
		};
		writeFileSync(cachePath, JSON.stringify(fresh), 'utf8');
		let fetched = false;
		const resolved = await resolvePricing(cachePath, {
			fetchImpl: async () => {
				fetched = true;
				return null;
			},
		});
		expect(resolved.models['only-cached']).toBeDefined();
		expect(fetched).toBe(false);
	});

	it('writes a background refresh when the cache is stale', async () => {
		const cachePath = join(dir, 'pricing.json');
		const stale: IPricingTable = {
			updatedAt: new Date(0).toISOString(),
			source: 'old',
			models: {},
		};
		writeFileSync(cachePath, JSON.stringify(stale), 'utf8');
		const refreshed: IPricingTable = {
			updatedAt: new Date().toISOString(),
			source: 'network',
			models: {
				refetched: {
					kind: 'api',
					inputCostPer1k: 1,
					outputCostPer1k: 1,
				},
			},
		};
		const resolved = await resolvePricing(cachePath, {
			fetchImpl: async () => refreshed,
		});
		// Returns the stale table immediately (empty models).
		expect(Object.keys(resolved.models)).toHaveLength(0);
		// Background refresh eventually lands on disk.
		await new Promise((r) => setTimeout(r, 50));
		const onDisk = JSON.parse(readFileSync(cachePath, 'utf8'));
		expect(onDisk.source).toBe('network');
	});
});

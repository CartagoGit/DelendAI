import { describe, expect, it } from 'vitest';

import {
	DEFAULT_MEMORY_COST_THRESHOLD,
	DEFAULT_MEMORY_RECENCY_HALF_LIFE_MS,
	DEFAULT_MEMORY_USAGE_HALF_COUNT,
	DEFAULT_MEMORY_UTILITY_WEIGHTS,
	createMemoryUtilityContext,
	filterByUtility,
	resolveMemoryUtilitySettings,
	utility,
	type IMemoryEntry,
	type IMemoryUtilityContext,
	type IMemoryUtilityWeights,
} from '../../../../src/lib/memory/utility';
import { retrieveByUtility } from '../../../../src/lib/memory/retrieve';

const NOW = 1_700_000_000_000; // fixed clock for determinism
const HOUR = 60 * 60 * 1_000;
const DAY = 24 * HOUR;

const ctx = (
	overrides: Partial<IMemoryUtilityContext> = {},
): IMemoryUtilityContext => ({
	now: NOW,
	maxSizeBytes: 4_000,
	recencyHalfLifeMs: 7 * DAY,
	usageHalfCount: 5,
	...overrides,
});

const entry = (overrides: Partial<IMemoryEntry> = {}): IMemoryEntry => ({
	id: 'mem-1',
	createdAt: NOW - 2 * DAY,
	lastUsedAt: NOW - 1 * HOUR,
	usageCount: 3,
	sizeBytes: 500,
	similarity: 0.6,
	...overrides,
});

describe('utility() (f00197)', () => {
	it('produces the documented formula for a typical entry', () => {
		const e = entry();
		const r = utility(e, DEFAULT_MEMORY_UTILITY_WEIGHTS, ctx());
		expect(r.components.recency).toBeGreaterThan(0.9); // very recent
		expect(r.components.similarity).toBeCloseTo(0.6, 5);
		expect(r.components.usage).toBeGreaterThan(0); // usage 3 / half 5
		expect(r.components.costBytes).toBeCloseTo(500 / 4_000, 5);
		// α·r + β·s + γ·u − δ·c
		expect(r.score).toBeCloseTo(
			DEFAULT_MEMORY_UTILITY_WEIGHTS.alpha * r.components.recency +
				DEFAULT_MEMORY_UTILITY_WEIGHTS.beta * 0.6 +
				DEFAULT_MEMORY_UTILITY_WEIGHTS.gamma * r.components.usage -
				DEFAULT_MEMORY_UTILITY_WEIGHTS.delta * r.components.costBytes,
			6,
		);
	});

	it('a recent + similar + heavily-used entry has the highest utility', () => {
		const hot = entry({ id: 'hot', usageCount: 100, similarity: 0.95 });
		const cold = entry({ id: 'cold', usageCount: 0, similarity: 0.05 });
		const rHot = utility(hot, DEFAULT_MEMORY_UTILITY_WEIGHTS, ctx());
		const rCold = utility(cold, DEFAULT_MEMORY_UTILITY_WEIGHTS, ctx());
		expect(rHot.score).toBeGreaterThan(rCold.score);
	});

	it('a very old + low-similarity entry scores below the threshold', () => {
		const stale = entry({
			id: 'stale',
			createdAt: NOW - 60 * DAY,
			lastUsedAt: NOW - 60 * DAY,
			usageCount: 0,
			similarity: 0.0,
		});
		const r = utility(stale, DEFAULT_MEMORY_UTILITY_WEIGHTS, ctx());
		expect(r.score).toBeLessThan(DEFAULT_MEMORY_COST_THRESHOLD);
	});

	it('a large entry is penalised by δ', () => {
		const small = entry({ sizeBytes: 100 });
		const huge = entry({ sizeBytes: 3_900 });
		const rSmall = utility(small, DEFAULT_MEMORY_UTILITY_WEIGHTS, ctx());
		const rHuge = utility(huge, DEFAULT_MEMORY_UTILITY_WEIGHTS, ctx());
		expect(rHuge.score).toBeLessThan(rSmall.score);
	});

	it('a missing similarity defaults to 0 (still scored on recency / usage)', () => {
		const e = entry();
		const { similarity: _omit, ...noSim } = e;
		const r = utility(noSim, DEFAULT_MEMORY_UTILITY_WEIGHTS, ctx());
		expect(r.components.similarity).toBe(0);
		expect(Number.isFinite(r.score)).toBe(true);
	});

	it('clamps weights that are NaN / Infinity to 0 (defensive)', () => {
		const e = entry();
		const r = utility(
			e,
			{
				alpha: Number.NaN,
				beta: Number.POSITIVE_INFINITY,
				gamma: -Number.POSITIVE_INFINITY,
				delta: Number.NaN,
			},
			ctx(),
		);
		expect(r.score).toBe(0);
	});

	it('zero delta → costBytes has no effect', () => {
		const e = entry();
		const w: IMemoryUtilityWeights = {
			alpha: 0,
			beta: 1,
			gamma: 0,
			delta: 0,
		};
		const r = utility(e, w, ctx());
		expect(r.score).toBeCloseTo(e.similarity ?? 0, 6);
	});
});

describe('filterByUtility() (f00197)', () => {
	it('drops entries below the costThreshold', () => {
		const hot = entry({ id: 'hot', usageCount: 100, similarity: 0.95 });
		const stale = entry({
			id: 'stale',
			createdAt: NOW - 90 * DAY,
			lastUsedAt: NOW - 90 * DAY,
			usageCount: 0,
			similarity: 0,
			sizeBytes: 100,
		});
		const out = filterByUtility(
			[hot, stale],
			DEFAULT_MEMORY_UTILITY_WEIGHTS,
			ctx(),
			DEFAULT_MEMORY_COST_THRESHOLD,
		);
		expect(out.map((s) => s.entry.id)).toEqual(['hot']);
	});

	it('applies a strict threshold comparison', () => {
		const exact = entry({ id: 'exact', similarity: 0.4, usageCount: 0 });
		const score = utility(
			exact,
			DEFAULT_MEMORY_UTILITY_WEIGHTS,
			ctx(),
		).score;
		expect(
			filterByUtility(
				[exact],
				DEFAULT_MEMORY_UTILITY_WEIGHTS,
				ctx(),
				score,
			),
		).toEqual([]);
	});

	it('returns the survivors best-first', () => {
		const a = entry({ id: 'a', similarity: 0.9, usageCount: 5 });
		const b = entry({ id: 'b', similarity: 0.5, usageCount: 2 });
		const c = entry({ id: 'c', similarity: 0.8, usageCount: 8 });
		const out = filterByUtility(
			[a, b, c],
			DEFAULT_MEMORY_UTILITY_WEIGHTS,
			ctx(),
			0,
		);
		expect(out[0]?.entry.id).toBe('a'); // highest similarity
	});

	it('returns an empty array when every entry is below the threshold', () => {
		const allStale = entry({
			id: 'all-stale',
			lastUsedAt: NOW - 365 * DAY,
			usageCount: 0,
			similarity: 0,
		});
		expect(
			filterByUtility(
				[allStale],
				DEFAULT_MEMORY_UTILITY_WEIGHTS,
				ctx(),
				1,
			),
		).toEqual([]);
	});

	it('an empty input returns an empty output (no throw)', () => {
		expect(
			filterByUtility([], DEFAULT_MEMORY_UTILITY_WEIGHTS, ctx(), 0),
		).toEqual([]);
	});

	it('falls back to the default threshold when a malformed value is passed', () => {
		const stale = entry({
			id: 'stale',
			lastUsedAt: NOW - 365 * DAY,
			usageCount: 0,
			similarity: 0,
		});
		expect(
			filterByUtility(
				[stale],
				DEFAULT_MEMORY_UTILITY_WEIGHTS,
				ctx(),
				Number.NaN,
			),
		).toEqual([]);
	});
});

describe('memory utility settings helpers (f00197)', () => {
	it('resolves malformed settings to safe defaults', () => {
		const resolved = resolveMemoryUtilitySettings({
			weights: {
				alpha: Number.NaN,
				beta: Number.POSITIVE_INFINITY,
				gamma: 0.9,
				delta: Number.NEGATIVE_INFINITY,
			},
			costThreshold: Number.NaN,
			recencyHalfLifeMs: 0,
			usageHalfCount: -10,
		});

		expect(resolved).toEqual({
			weights: {
				alpha: DEFAULT_MEMORY_UTILITY_WEIGHTS.alpha,
				beta: DEFAULT_MEMORY_UTILITY_WEIGHTS.beta,
				gamma: 0.9,
				delta: DEFAULT_MEMORY_UTILITY_WEIGHTS.delta,
			},
			costThreshold: DEFAULT_MEMORY_COST_THRESHOLD,
			recencyHalfLifeMs: 1,
			usageHalfCount: 1,
		});
	});

	it('builds the retrieval context from the batch and explicit tuning', () => {
		const context = createMemoryUtilityContext(
			[entry({ sizeBytes: 120 }), entry({ sizeBytes: 900 })],
			NOW,
			{
				recencyHalfLifeMs: 2 * DAY,
				usageHalfCount: 7,
			},
		);

		expect(context).toEqual({
			now: NOW,
			maxSizeBytes: 900,
			recencyHalfLifeMs: 2 * DAY,
			usageHalfCount: 7,
		});
	});

	it('uses the documented defaults when no tuning is provided', () => {
		const context = createMemoryUtilityContext([entry()], NOW);
		expect(context.recencyHalfLifeMs).toBe(
			DEFAULT_MEMORY_RECENCY_HALF_LIFE_MS,
		);
		expect(context.usageHalfCount).toBe(DEFAULT_MEMORY_USAGE_HALF_COUNT);
	});
});

describe('retrieveByUtility() (f00197)', () => {
	it('filters low-utility metadata before context injection', () => {
		const hot = entry({ id: 'hot', usageCount: 100, similarity: 0.95 });
		const stale = entry({
			id: 'stale',
			lastUsedAt: NOW - 365 * DAY,
			usageCount: 0,
			similarity: 0,
		});
		const result = retrieveByUtility([hot, stale], { now: NOW });
		expect(result.matches.map((match) => match.entry.id)).toEqual(['hot']);
		expect(result.filteredCount).toBe(1);
	});

	it('accepts config-like nested utility tuning without breaking legacy options', () => {
		const hot = entry({ id: 'hot', similarity: 0.95, usageCount: 12 });
		const borderline = entry({
			id: 'borderline',
			similarity: 0.2,
			usageCount: 0,
			lastUsedAt: NOW - 21 * DAY,
			sizeBytes: 3_800,
		});

		const result = retrieveByUtility([hot, borderline], {
			now: NOW,
			costThreshold: 0.99,
			utility: {
				costThreshold: 0.2,
				weights: {
					alpha: 0.35,
					beta: 0.45,
					gamma: 0.2,
					delta: 0.25,
				},
				recencyHalfLifeMs: 14 * DAY,
				usageHalfCount: 4,
			},
		});

		expect(result.matches.map((match) => match.entry.id)).toEqual(['hot']);
		expect(result.filteredCount).toBe(1);
	});

	it('does not expose memory content fields in the result', () => {
		const result = retrieveByUtility([entry()], { now: NOW });
		expect(Object.keys(result.matches[0]?.entry ?? {}).sort()).toEqual([
			'createdAt',
			'id',
			'lastUsedAt',
			'similarity',
			'sizeBytes',
			'usageCount',
		]);
	});
});

describe('privacy (f00197 R1.1–R1.10)', () => {
	it('the selector surface does NOT carry memory content fields', () => {
		const e = entry();
		const keys = Object.keys(e).sort();
		expect(keys).toEqual([
			'createdAt',
			'id',
			'lastUsedAt',
			'similarity',
			'sizeBytes',
			'usageCount',
		]);
	});
});

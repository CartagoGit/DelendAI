import { describe, expect, it } from 'vitest';

import {
	DEFAULT_UTILITY_WEIGHTS,
	rankCandidates,
	utility,
	type IProviderCandidate,
	type IRoutingContext,
	type IUtilityWeights,
} from '../../../../src/lib/routing/utility';

const ctx = (overrides: Partial<IRoutingContext> = {}): IRoutingContext => ({
	maxTokenCost: 100,
	maxLatencyMs: 1_000,
	...overrides,
});

const cand = (
	overrides: Partial<IProviderCandidate> = {},
): IProviderCandidate => ({
	quality: 0.8,
	tokenCost: 50,
	latencyMs: 500,
	securityRisk: 0.1,
	...overrides,
});

describe('utility() (f00195)', () => {
	it('produces the documented formula at the normalised reference point', () => {
		// quality=0.8, tokenCost/maxTokenCost=50/100=0.5, latency/maxLatency=500/1000=0.5,
		// securityRisk=0.1; default weights λ=0.4 μ=0.3 ν=0.3.
		const r = utility(cand(), DEFAULT_UTILITY_WEIGHTS, ctx());
		expect(r.components.quality).toBeCloseTo(0.8, 5);
		expect(r.components.tokenCost).toBeCloseTo(0.5, 5);
		expect(r.components.latency).toBeCloseTo(0.5, 5);
		expect(r.components.securityRisk).toBeCloseTo(0.1, 5);
		expect(r.score).toBeCloseTo(0.8 - 0.4 * 0.5 - 0.3 * 0.5 - 0.3 * 0.1, 6);
	});

	it('is deterministic — same inputs → same output', () => {
		const c = cand();
		const w = DEFAULT_UTILITY_WEIGHTS;
		const r1 = utility(c, w, ctx());
		const r2 = utility(c, w, ctx());
		expect(r1.score).toBe(r2.score);
	});

	it('clamps `quality` and `securityRisk` to [0, 1]', () => {
		const r = utility(
			cand({ quality: 1.5, securityRisk: -0.5 }),
			DEFAULT_UTILITY_WEIGHTS,
			ctx(),
		);
		expect(r.components.quality).toBe(1);
		expect(r.components.securityRisk).toBe(0);
	});

	it('collapses normalised cost / latency to 0 when the context max is non-positive', () => {
		const r = utility(cand(), DEFAULT_UTILITY_WEIGHTS, {
			maxTokenCost: 0,
			maxLatencyMs: 0,
		});
		expect(r.components.tokenCost).toBe(0);
		expect(r.components.latency).toBe(0);
	});

	it('treats non-finite weights as 0 (defensive)', () => {
		const r = utility(
			cand(),
			{
				lambda: Number.NaN,
				mu: Number.POSITIVE_INFINITY,
				nu: -Number.POSITIVE_INFINITY,
			},
			ctx(),
		);
		expect(Number.isFinite(r.score)).toBe(true);
		expect(r.score).toBeCloseTo(r.components.quality, 6);
	});

	it('zero weights → score == quality', () => {
		const r = utility(
			cand({ quality: 0.7 }),
			{ lambda: 0, mu: 0, nu: 0 },
			ctx(),
		);
		expect(r.score).toBeCloseTo(0.7, 6);
	});

	it('a higher λ picks the cheaper candidate when quality ties', () => {
		const _equalQuality = cand({ quality: 0.9 });
		const expensive = cand({ quality: 0.9, tokenCost: 80 });
		const cheap = cand({ quality: 0.9, tokenCost: 20 });
		const w: IUtilityWeights = { lambda: 1, mu: 0, nu: 0 };
		const r1 = utility(expensive, w, ctx());
		const r2 = utility(cheap, w, ctx());
		expect(r2.score).toBeGreaterThan(r1.score);
	});

	it('a higher μ picks the lower-latency candidate when quality ties', () => {
		const slow = cand({ quality: 0.9, latencyMs: 800 });
		const fast = cand({ quality: 0.9, latencyMs: 100 });
		const w: IUtilityWeights = { lambda: 0, mu: 1, nu: 0 };
		const r1 = utility(slow, w, ctx());
		const r2 = utility(fast, w, ctx());
		expect(r2.score).toBeGreaterThan(r1.score);
	});

	it('a higher ν picks the safer candidate when quality / cost tie', () => {
		const risky = cand({ quality: 0.9, tokenCost: 30, securityRisk: 0.8 });
		const safe = cand({ quality: 0.9, tokenCost: 30, securityRisk: 0.05 });
		const w: IUtilityWeights = { lambda: 0, mu: 0, nu: 1 };
		const r1 = utility(risky, w, ctx());
		const r2 = utility(safe, w, ctx());
		expect(r2.score).toBeGreaterThan(r1.score);
	});
});

describe('rankCandidates() (f00195)', () => {
	it('returns candidates best-first by score', () => {
		const bakery = cand({ quality: 0.95, tokenCost: 80, latencyMs: 700 });
		const books = cand({ quality: 0.7, tokenCost: 20, latencyMs: 200 });
		const pets = cand({ quality: 0.5, tokenCost: 5, latencyMs: 50 });
		// With default weights (λ=0.4 μ=0.3 ν=0.3) the high quality / high
		// cost bakery is penalised enough that books (0.49) edges it out
		// (bakery ≈ 0.39). The point is: ranking is driven by score, not
		// raw quality — that's the cost-aware bit.
		const ranked = rankCandidates(
			[bakery, books, pets],
			DEFAULT_UTILITY_WEIGHTS,
			ctx(),
		);
		const qualities = ranked.map((r) => r.candidate.quality);
		// Score-ordered, not quality-ordered: 0.7 first, 0.5 second, 0.95 last.
		expect(qualities).toEqual([0.7, 0.5, 0.95]);
	});

	it('a quality-only ranking (zero weights) puts the highest quality first', () => {
		const bakery = cand({ quality: 0.95, tokenCost: 80, latencyMs: 700 });
		const books = cand({ quality: 0.7, tokenCost: 20, latencyMs: 200 });
		const ranked = rankCandidates(
			[bakery, books],
			{ lambda: 0, mu: 0, nu: 0 },
			ctx(),
		);
		expect(ranked[0]?.candidate.quality).toBe(0.95);
	});

	it('a high λ surfaces a cheap candidate even with worse quality (bakery/books/pets scenario)', () => {
		// Three synthetic providers covering the canonical R1.4 scenarios.
		const bakery = cand({ quality: 0.9, tokenCost: 90, latencyMs: 800 });
		const books = cand({ quality: 0.6, tokenCost: 30, latencyMs: 200 });
		const pets = cand({ quality: 0.4, tokenCost: 5, latencyMs: 50 });
		const ranked = rankCandidates(
			[bakery, books, pets],
			{ lambda: 1, mu: 0, nu: 0 },
			ctx(),
		);
		expect(ranked[0]?.candidate.quality).toBe(0.4); // pets wins — cheapest
		expect(ranked[2]?.candidate.quality).toBe(0.9); // bakery loses
	});

	it('a high μ surfaces a low-latency candidate', () => {
		const slow = cand({ quality: 0.9, latencyMs: 900 });
		const fast = cand({ quality: 0.9, latencyMs: 100 });
		const ranked = rankCandidates(
			[slow, fast],
			{ lambda: 0, mu: 1, nu: 0 },
			ctx(),
		);
		expect(ranked[0]?.candidate.latencyMs).toBe(100);
	});

	it('breaks ties deterministically — cheaper wins on equal score', () => {
		const a = cand({ quality: 0.9, tokenCost: 50 });
		const b = cand({ quality: 0.9, tokenCost: 25 });
		const ranked = rankCandidates(
			[a, b],
			{ lambda: 0, mu: 0, nu: 0 },
			ctx(),
		);
		expect(ranked[0]?.candidate.tokenCost).toBe(25);
	});

	it('handles an empty candidate list without throwing', () => {
		expect(rankCandidates([], DEFAULT_UTILITY_WEIGHTS, ctx())).toEqual([]);
	});

	it('a single candidate with no observed maxes scores on quality only', () => {
		const only = cand({ quality: 0.6, tokenCost: 10, latencyMs: 100 });
		const r = rankCandidates([only], DEFAULT_UTILITY_WEIGHTS, {
			maxTokenCost: 0,
			maxLatencyMs: 0,
		});
		expect(r).toHaveLength(1);
		expect(r[0]?.components.tokenCost).toBe(0);
		expect(r[0]?.components.latency).toBe(0);
	});
});

import { describe, expect, it } from 'vitest';

import type { IRankedHit } from '../../../../src/lib/contracts/interfaces/hybrid-rank.interface';
import { fuseRankings } from '../../../../src/lib/rank/fuse';

const hit = (id: string, score: number): IRankedHit => ({ id, score });

describe('fuseRankings', async () => {
	it('returns the bm25 ranking unchanged when vector is empty', async () => {
		const bm25 = [hit('alpha', 0.9), hit('beta', 0.7), hit('gamma', 0.4)];

		const result = fuseRankings({ bm25, vector: [] });

		expect(result.strategy).toBe('bm25-only');
		expect(result.hits).toBe(bm25);
		expect(result.hits).toEqual(bm25);
	});

	it('behaves like the vector ranking when bm25 is empty', async () => {
		const vector = [
			hit('beta', 0.95),
			hit('alpha', 0.8),
			hit('gamma', 0.6),
		];

		const result = fuseRankings({
			bm25: [],
			vector,
			weights: { vector: 1, bm25: 0 },
		});

		expect(result.strategy).toBe('rrf');
		expect(result.hits.map((entry) => entry.id)).toEqual([
			'beta',
			'alpha',
			'gamma',
		]);
		expect(result.hits.map((entry) => entry.score)).toEqual([
			1 / 61,
			1 / 62,
			1 / 63,
		]);
	});

	it('computes reciprocal-rank fusion across overlapping rankings', async () => {
		const result = fuseRankings({
			bm25: [hit('alpha', 1), hit('beta', 0.8), hit('gamma', 0.6)],
			vector: [hit('beta', 0.99), hit('gamma', 0.9), hit('alpha', 0.7)],
			weights: { bm25: 0.7, vector: 0.3 },
			rrfK: 10,
		});

		expect(result.strategy).toBe('rrf');
		expect(result.hits.map((entry) => entry.id)).toEqual([
			'alpha',
			'beta',
			'gamma',
		]);
		expect(result.hits[0]?.score).toBeCloseTo(
			0.7 * (1 / 11) + 0.3 * (1 / 13),
			12,
		);
		expect(result.hits[1]?.score).toBeCloseTo(
			0.7 * (1 / 12) + 0.3 * (1 / 11),
			12,
		);
		expect(result.hits[2]?.score).toBeCloseTo(
			0.7 * (1 / 13) + 0.3 * (1 / 12),
			12,
		);
		expect(result.hits[0]?.features).toEqual({
			bm25Rank: 1,
			vectorRank: 3,
		});
		expect(result.hits[1]?.features).toEqual({
			bm25Rank: 2,
			vectorRank: 1,
		});
		expect(result.hits[2]?.features).toEqual({
			bm25Rank: 3,
			vectorRank: 2,
		});
	});

	it('gracefully fuses hits even when the vector ranking is truncated', async () => {
		const result = fuseRankings({
			bm25: [hit('alpha', 1), hit('beta', 0.8), hit('gamma', 0.5)],
			vector: [hit('gamma', 0.95)],
			weights: { bm25: 0.5, vector: 0.5 },
			rrfK: 20,
		});

		expect(result.hits.map((entry) => entry.id)).toEqual([
			'gamma',
			'alpha',
			'beta',
		]);
		expect(result.hits[0]?.score).toBeCloseTo(
			0.5 * (1 / 23) + 0.5 * (1 / 21),
			12,
		);
		expect(result.hits[1]?.features).toEqual({ bm25Rank: 1 });
		expect(result.hits[2]?.features).toEqual({ bm25Rank: 2 });
	});

	it('defaults both weights to 0.5 when omitted', async () => {
		const result = fuseRankings({
			bm25: [hit('alpha', 0.9)],
			vector: [hit('alpha', 0.8)],
		});

		expect(result.hits).toHaveLength(1);
		expect(result.hits[0]?.score).toBeCloseTo(1 / 61, 12);
		expect(result.hits[0]?.features).toEqual({
			bm25Rank: 1,
			vectorRank: 1,
		});
	});

	it('returns an empty ranking when both weights are zero', async () => {
		const result = fuseRankings({
			bm25: [hit('alpha', 1)],
			vector: [hit('beta', 1)],
			weights: { bm25: 0, vector: 0 },
		});

		expect(result.strategy).toBe('rrf');
		expect(result.hits).toEqual([]);
	});
});

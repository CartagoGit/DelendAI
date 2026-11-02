import type {
	IHybridRankInput,
	IHybridRankResult,
	IRankedHit,
} from '../contracts/interfaces/hybrid-rank.interface';

type RankSource = 'bm25' | 'vector';

interface IAccumulatedRank {
	readonly id: string;
	readonly bm25Rank?: number;
	readonly vectorRank?: number;
	readonly score: number;
}

const DEFAULT_RRF_K = 60;
const DEFAULT_WEIGHTS = {
	bm25: 0.5,
	vector: 0.5,
} as const;

const reciprocalRankScore = (rank: number, k: number, weight: number): number =>
	weight * (1 / (k + rank));

const sortByScoreDescending = (left: IRankedHit, right: IRankedHit): number => {
	if (right.score !== left.score) {
		return right.score - left.score;
	}

	return left.id.localeCompare(right.id);
};

const addRanking = (
	accumulator: Map<string, IAccumulatedRank>,
	ranking: readonly IRankedHit[],
	source: RankSource,
	weight: number,
	k: number,
): void => {
	for (const [index, hit] of ranking.entries()) {
		const rank = index + 1;
		const previous = accumulator.get(hit.id);
		const score =
			(previous?.score ?? 0) + reciprocalRankScore(rank, k, weight);
		accumulator.set(hit.id, {
			id: hit.id,
			score,
			...(source === 'bm25' ? { bm25Rank: rank } : {}),
			...(source === 'vector' ? { vectorRank: rank } : {}),
			...(previous?.bm25Rank !== undefined
				? { bm25Rank: previous.bm25Rank }
				: {}),
			...(previous?.vectorRank !== undefined
				? { vectorRank: previous.vectorRank }
				: {}),
		});
	}
};

const toRankedHit = (hit: IAccumulatedRank): IRankedHit => ({
	id: hit.id,
	score: hit.score,
	...(hit.bm25Rank !== undefined || hit.vectorRank !== undefined
		? {
				features: {
					...(hit.bm25Rank !== undefined
						? { bm25Rank: hit.bm25Rank }
						: {}),
					...(hit.vectorRank !== undefined
						? { vectorRank: hit.vectorRank }
						: {}),
				},
			}
		: {}),
});

export const fuseRankings = (input: IHybridRankInput): IHybridRankResult => {
	const bm25Weight = input.weights?.bm25 ?? DEFAULT_WEIGHTS.bm25;
	const vectorWeight = input.weights?.vector ?? DEFAULT_WEIGHTS.vector;
	const rrfK = input.rrfK ?? DEFAULT_RRF_K;

	if (bm25Weight === 0 && vectorWeight === 0) {
		return {
			hits: [],
			strategy: input.vector.length === 0 ? 'bm25-only' : 'rrf',
		};
	}

	if (input.vector.length === 0) {
		return {
			hits: input.bm25,
			strategy: 'bm25-only',
		};
	}

	const fused = new Map<string, IAccumulatedRank>();
	addRanking(fused, input.bm25, 'bm25', bm25Weight, rrfK);
	addRanking(fused, input.vector, 'vector', vectorWeight, rrfK);

	const hits = [...fused.values()]
		.filter((hit) => hit.score > 0)
		.map(toRankedHit)
		.sort(sortByScoreDescending);

	return {
		hits,
		strategy: 'rrf',
	};
};

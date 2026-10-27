export interface IRankedHit {
	readonly id: string;
	readonly score: number;
	readonly features?: Readonly<Record<string, number>>;
}

export interface IHybridRankInput {
	readonly bm25: readonly IRankedHit[];
	readonly vector: readonly IRankedHit[];
	readonly weights?: {
		readonly bm25?: number;
		readonly vector?: number;
	};
	readonly rrfK?: number;
}

export interface IHybridRankResult {
	readonly hits: readonly IRankedHit[];
	readonly strategy: 'rrf' | 'bm25-only';
}

export interface ISearchHybridWeights {
	readonly bm25: number;
	readonly vector: number;
}

export type IPackStackId =
	| 'default'
	| 'typescript-heavy'
	| 'documentation-only';

export const DEFAULT_SEARCH_HYBRID_WEIGHTS: ISearchHybridWeights = {
	bm25: 0.5,
	vector: 0.5,
};

export const STACK_SEARCH_HYBRID_WEIGHTS: Readonly<
	Record<Exclude<IPackStackId, 'default'>, ISearchHybridWeights>
> = {
	'typescript-heavy': {
		bm25: 0.4,
		vector: 0.6,
	},
	'documentation-only': {
		bm25: 0.7,
		vector: 0.3,
	},
};

const cloneWeights = (weights: ISearchHybridWeights): ISearchHybridWeights => ({
	bm25: weights.bm25,
	vector: weights.vector,
});

export const resolveSearchHybridWeights = (
	stackId?: string,
): ISearchHybridWeights =>
	cloneWeights(
		stackId !== undefined && stackId in STACK_SEARCH_HYBRID_WEIGHTS
			? STACK_SEARCH_HYBRID_WEIGHTS[
					stackId as Exclude<IPackStackId, 'default'>
				]
			: DEFAULT_SEARCH_HYBRID_WEIGHTS,
	);

export const PACK_DEFAULTS: Readonly<
	Record<IPackStackId, Readonly<Record<string, unknown>>>
> = {
	default: {
		search: {
			hybridWeights: cloneWeights(DEFAULT_SEARCH_HYBRID_WEIGHTS),
		},
	},
	'typescript-heavy': {
		search: {
			hybridWeights: cloneWeights(
				STACK_SEARCH_HYBRID_WEIGHTS['typescript-heavy'],
			),
		},
	},
	'documentation-only': {
		search: {
			hybridWeights: cloneWeights(
				STACK_SEARCH_HYBRID_WEIGHTS['documentation-only'],
			),
		},
	},
};

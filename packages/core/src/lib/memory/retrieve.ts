import {
	DEFAULT_MEMORY_COST_THRESHOLD,
	DEFAULT_MEMORY_UTILITY_WEIGHTS,
	filterByUtility,
	type IMemoryEntry,
	type IMemoryUtilityContext,
	type IMemoryUtilityScore,
	type IMemoryUtilityWeights,
} from './utility';

export interface IMemoryRetrievalOptions {
	readonly now: number;
	readonly recencyHalfLifeMs?: number;
	readonly usageHalfCount?: number;
	readonly weights?: IMemoryUtilityWeights;
	readonly costThreshold?: number;
}

export interface IMemoryRetrievalResult {
	readonly matches: readonly IMemoryUtilityScore[];
	readonly filteredCount: number;
}

/** Filter already-ranked memory metadata before content injection. */
export const retrieveByUtility = (
	entries: readonly IMemoryEntry[],
	options: IMemoryRetrievalOptions,
): IMemoryRetrievalResult => {
	const context: IMemoryUtilityContext = {
		now: options.now,
		maxSizeBytes: entries.reduce(
			(max, entry) => Math.max(max, entry.sizeBytes),
			0,
		),
		recencyHalfLifeMs:
			options.recencyHalfLifeMs ?? 7 * 24 * 60 * 60 * 1_000,
		usageHalfCount: options.usageHalfCount ?? 5,
	};
	const matches = filterByUtility(
		entries,
		options.weights ?? DEFAULT_MEMORY_UTILITY_WEIGHTS,
		context,
		options.costThreshold ?? DEFAULT_MEMORY_COST_THRESHOLD,
	);
	return {
		matches,
		filteredCount: entries.length - matches.length,
	};
};

import {
	DEFAULT_MEMORY_COST_THRESHOLD,
	DEFAULT_MEMORY_UTILITY_WEIGHTS,
	createMemoryUtilityContext,
	filterByUtility,
	type IMemoryEntry,
	type IMemoryUtilityScore,
	type IMemoryUtilitySettings,
	type IMemoryUtilityWeights,
	resolveMemoryUtilitySettings,
} from './utility';

export interface IMemoryRetrievalOptions {
	readonly now: number;
	readonly recencyHalfLifeMs?: number;
	readonly usageHalfCount?: number;
	readonly weights?: IMemoryUtilityWeights;
	readonly costThreshold?: number;
	readonly utility?: IMemoryUtilitySettings;
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
	const settings = resolveMemoryUtilitySettings({
		...(options.weights === undefined ? {} : { weights: options.weights }),
		...(options.costThreshold === undefined
			? {}
			: { costThreshold: options.costThreshold }),
		...(options.recencyHalfLifeMs === undefined
			? {}
			: { recencyHalfLifeMs: options.recencyHalfLifeMs }),
		...(options.usageHalfCount === undefined
			? {}
			: { usageHalfCount: options.usageHalfCount }),
		...(options.utility ?? {}),
	});
	const context = createMemoryUtilityContext(entries, options.now, settings);
	const matches = filterByUtility(
		entries,
		settings.weights ?? DEFAULT_MEMORY_UTILITY_WEIGHTS,
		context,
		settings.costThreshold ?? DEFAULT_MEMORY_COST_THRESHOLD,
	);
	return {
		matches,
		filteredCount: entries.length - matches.length,
	};
};

/** Names and legacy paths the shipped cache layout migrations know. */

export const RESULTS_SEGREGATION_STEP_ID = 'cacheLayout:results-segregation';
export const CANONICAL_SCRATCH_STEP_ID = 'cacheLayout:canonical-scratch';
export const CONSOLIDATED_CACHE_STEP_ID = 'cacheLayout:consolidated-cache';
export const DERIVED_INDEX_RELOCATED_STEP_ID =
	'cacheLayout:derived-index-relocated';
export const REBRAND_STEP_ID = 'cacheLayout:rebrand';

/** Legacy cache-relative directory -> where it lives now. Records. */
export const RESULTS_SEGREGATION_PATHS: readonly (readonly [string, string])[] =
	[
		['logs', 'results/logs'],
		['logs-errors', 'results/logs-errors'],
		['memory', 'results/memory'],
		['usage-tracking', 'results/usage-tracking'],
	];

/** Legacy dotted scratch directory -> canonical name. Ephemeral. */
export const CANONICAL_SCRATCH_PATHS: readonly (readonly [string, string])[] = [
	['.verify-tmp', 'verify-tmp'],
	['.commit-policy', 'commit-policy'],
];

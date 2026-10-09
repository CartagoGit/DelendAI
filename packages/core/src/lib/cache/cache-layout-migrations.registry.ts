import {
	CONSOLIDATED_CACHE_STEP_ID,
	PROPOSALS_INDEX_STEP_ID,
	REBRAND_STEP_ID,
} from '../contracts/constants/cache-layout-migration.constant';
import type { ICacheLayoutMigration } from '../contracts/interfaces/cache-layout.interface';
import { createCanonicalScratchMigration } from './migrations/canonical-scratch.migration';
import { createResultsSegregationMigration } from './migrations/results-segregation.migration';
import { createUnchangedInCacheMigration } from './migrations/unchanged-in-cache.migration';

/**
 * The layout migrations this build ships, one per epoch, in order.
 *
 * Epochs 0 -> 1 (caches consolidated out of sub-projects), 3 -> 4 (the
 * proposals index left `docs/`) and 4 -> 5 (the rebrand) changed things
 * outside the cache directory or in the identity engine, and the lifecycle
 * only ever touches the cache directory, so those steps find nothing to do.
 */
export const defaultCacheLayoutMigrations =
	(): readonly ICacheLayoutMigration[] => [
		createUnchangedInCacheMigration(CONSOLIDATED_CACHE_STEP_ID, 0),
		createCanonicalScratchMigration(),
		createResultsSegregationMigration(),
		createUnchangedInCacheMigration(PROPOSALS_INDEX_STEP_ID, 3),
		createUnchangedInCacheMigration(REBRAND_STEP_ID, 4),
	];

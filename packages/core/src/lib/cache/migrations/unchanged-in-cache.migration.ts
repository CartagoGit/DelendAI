import type { ICacheLayoutMigration } from '../../contracts/interfaces/cache-layout.interface';

/**
 * An epoch whose layout change left nothing to move inside the cache
 * directory: the change happened elsewhere (outside the cache, or in the
 * identity engine). The step exists so the chain stays one epoch per step;
 * it finds nothing to do and touches nothing.
 */
export const createUnchangedInCacheMigration = (
	id: string,
	fromEpoch: number,
): ICacheLayoutMigration => ({
	id,
	fromEpoch,
	toEpoch: fromEpoch + 1,
	detect: async () => false,
	plan: async () => [],
	apply: async () => undefined,
});

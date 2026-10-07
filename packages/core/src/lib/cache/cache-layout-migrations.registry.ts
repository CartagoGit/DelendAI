import type { ICacheLayoutMigration } from '../contracts/interfaces/cache-layout.interface';

/**
 * The layout migrations this build ships, one per epoch, in order.
 *
 * Empty until the historical migrators are registered: an empty list means
 * "this build knows no layout history", and the runner then leaves the
 * workspace and its epoch alone instead of recording an epoch no migration
 * ever vouched for.
 */
export const defaultCacheLayoutMigrations =
	(): readonly ICacheLayoutMigration[] => [];

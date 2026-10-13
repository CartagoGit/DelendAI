/**
 * core-eviction.constant.ts — how long the core keeps what it owns at the cache root.
 */

/** A log a writer rotated aside is kept this long. */
export const ROTATED_LOG_MAX_AGE_DAYS = 7;

/** A scratch file a one-off run left at the cache root is kept this long. */
export const SCRATCH_FILE_MAX_AGE_DAYS = 30;

export const CORE_EVICTION_DAY_MS = 24 * 60 * 60 * 1000;

/**
 * core-eviction.constant.ts — how long the core keeps what it owns at the cache root.
 */

/** A log a writer rotated aside is kept this long. */
export const ROTATED_LOG_MAX_AGE_DAYS = 7;

/** A scratch file a one-off run left at the cache root is kept this long. */
export const SCRATCH_FILE_MAX_AGE_DAYS = 30;

export const CORE_EVICTION_DAY_MS = 24 * 60 * 60 * 1000;

/**
 * What eviction never touches under the cache directory, because another
 * owner decides when it goes: the units (`work reap`, which keeps any
 * uncommitted edit on the forge first), delendai's records, and the state
 * database with its journal files. A rule naming one of these, or a path
 * inside one, is refused when it is registered.
 */
export const EVICTION_PROTECTED_PATHS = [
	'.worktrees',
	'records',
	'state',
] as const;

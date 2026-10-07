/** Frontmatter field that stamps when the document last changed status. */
export const LAST_TRANSITION_AT_FIELD = 'last-transition-at';

/** Targets whose arrival closes a measurable stretch of work. */
export const DURATION_TARGET_STATUSES: readonly string[] = ['done', 'review'];

/** Task kind recorded when the document declares none. */
export const DEFAULT_DURATION_TASK_KIND = 'proposal';

/** Actor recorded when the caller did not identify itself. */
export const DEFAULT_DURATION_ACTOR = 'unknown';

/** Where the history lives, relative to the cache directory. */
export const DURATION_HISTORY_CACHE_FILE = 'telemetry/duration-history.sqlite';

/**
 * delendai-records.constant.ts — where the records delendai keeps about a
 * workspace live: one folder inside its cache directory.
 */

/** The folder, inside the cache directory, that holds delendai's records. */
export const RECORDS_DIR = 'records';

/** Where an older delendai kept them, at the workspace root. */
export const LEGACY_RECORDS_DIR = '.delendai';

/** The file, in the clone's git directory, naming the cache directory last applied. */
export const CACHE_DIR_POINTER = 'delendai-cache-dir';

export const DEFAULT_CACHE_DIR = '.cache/delendai';

/** The project profile adoption derives, inside the records folder. */
export const PROJECT_PROFILE_RECORD = 'project-profile.json';

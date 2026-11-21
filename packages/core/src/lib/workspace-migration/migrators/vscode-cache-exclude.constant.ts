/** Constants for `./vscode-cache-exclude` and its migrator. */

/** Stable id recorded in the journal. */
export const VSCODE_CACHE_EXCLUDE_MIGRATOR_ID = 'vscodeCacheExcludeMigrator:v1';

/** The editor settings file, relative to the workspace root. */
export const VSCODE_SETTINGS_FILE = '.vscode/settings.json';

/** The settings that hold a map of glob → boolean the editor skips. */
export const CACHE_EXCLUDE_SETTINGS: readonly string[] = [
	'files.watcherExclude',
	'search.exclude',
];

/** The directory the glob collapses to when the cache lies beneath it. */
export const SHARED_CACHE_ROOT = '.cache';

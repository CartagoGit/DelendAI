/** Constants for `./stray-member-cache.migrator`. */

/** Stable id recorded in the journal. */
export const STRAY_MEMBER_CACHE_MIGRATOR_ID = 'strayMemberCacheMigrator:v1';

/** The cache a server writes, relative to the directory it took as its workspace. */
export const MEMBER_CACHE_SEGMENTS: readonly string[] = ['.cache', 'delendai'];

/** What such a cache may hold and still be thrown away: all of it regenerates. */
export const REGENERABLE_CACHE_ENTRIES: readonly string[] = [
	'.gitignore',
	'evidence',
	'logs',
	'results',
	'runtime',
	'scratch',
];

/** Directories under the workspace that are never members. */
export const NOT_MEMBER_DIRECTORIES: readonly string[] = [
	'.cache',
	'.git',
	'coverage',
	'dist',
	'node_modules',
];

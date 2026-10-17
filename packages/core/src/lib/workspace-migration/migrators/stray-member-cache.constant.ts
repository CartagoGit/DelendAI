/** Constants for `./stray-member-cache.migrator`. */

/** Stable id recorded in the journal. */
export const STRAY_MEMBER_CACHE_MIGRATOR_ID = 'strayMemberCacheMigrator:v1';

/** The cache a server writes, relative to the directory it took as its workspace. */
export const MEMBER_CACHE_SEGMENTS: readonly string[] = ['.cache', 'delendai'];

/** What such a cache may hold and still be thrown away: it regenerates. */
export const REGENERABLE_CACHE_ENTRIES: readonly string[] = [
	'.gitignore',
	'runtime',
	'scratch',
];

/**
 * What such a cache may hold that does not regenerate: the record of past
 * runs. It is moved into the workspace's own cache, never deleted.
 */
export const KEPT_CACHE_ENTRIES: readonly string[] = [
	'evidence',
	'logs',
	'results',
];

/** Where, under the workspace's own cache, a member's kept entries go. */
export const KEPT_FROM_MEMBERS_DIR = 'from-members';

/** Directories under the workspace that are never members. */
export const NOT_MEMBER_DIRECTORIES: readonly string[] = [
	'.cache',
	'.git',
	'coverage',
	'dist',
	'node_modules',
];

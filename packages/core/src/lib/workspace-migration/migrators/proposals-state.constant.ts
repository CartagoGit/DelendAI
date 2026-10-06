/** Constants for `./proposals-state.migrator`. */

/** Where the proposals database lived before it moved under the cache. */
export const LEGACY_PROPOSALS_STATE_SEGMENTS: readonly string[] = [
	'.delendai',
	'state',
];

/**
 * Where it lives now: the layout `@delendai/proposals-sqlite` resolves
 * (`db-path.ts`). Core may not import that package, so the two places
 * name it; the migrator's spec pins that they agree.
 */
export const PROPOSALS_STATE_SEGMENTS: readonly string[] = [
	'.cache',
	'delendai',
	'state',
];

/** The database and the sidecars SQLite keeps its uncommitted pages in. */
export const PROPOSALS_DB_FILES: readonly string[] = [
	'proposals.sqlite',
	'proposals.sqlite-wal',
	'proposals.sqlite-shm',
];

/** The registry's old, committed location under the documents directory. */
export const LEGACY_REGISTRY_SEGMENTS: readonly string[] = [
	'proposals',
	'index.json',
];

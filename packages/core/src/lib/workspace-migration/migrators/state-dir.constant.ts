/** Constants for `./state-dir.migrator`. */

/** Where the state databases lived before they moved under the cache. */
export const LEGACY_STATE_SEGMENTS: readonly string[] = ['.delendai', 'state'];

/** Where they live now, under the cache directory. */
export const STATE_SEGMENTS: readonly string[] = [
	'.cache',
	'delendai',
	'state',
];

/** SQLite's sidecars: they move before the database they belong to. */
export const SQLITE_SIDECAR_SUFFIXES: readonly string[] = ['-wal', '-shm'];

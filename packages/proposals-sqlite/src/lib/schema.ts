/**
 * schema.ts — q00022 S1.
 *
 * Re-exports the version constants and the boot PRAGMAs the SQLite
 * driver must apply on every connection. The actual SQL lives in
 * `./migrations/*.sql` so a real SQLite parser handles it; this file
 * only surfaces the metadata other modules need.
 */

export const PROPOSALS_SQLITE_SCHEMA_VERSION = 5;

export const SQLITE_BOOT_PRAGMAS = [
	'PRAGMA foreign_keys = ON;',
	'PRAGMA journal_mode = WAL;',
	'PRAGMA synchronous = NORMAL;',
	'PRAGMA busy_timeout = 5000;',
	`PRAGMA user_version = ${String(PROPOSALS_SQLITE_SCHEMA_VERSION)};`,
] as const;

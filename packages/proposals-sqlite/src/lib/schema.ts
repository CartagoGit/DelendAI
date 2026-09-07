/**
 * schema.ts — q00022 S1 + x00511 S1.
 *
 * Re-exports the version constants and the boot PRAGMAs the SQLite
 * driver must apply on every connection. The actual SQL lives in
 * `./migrations/*.sql` so a real SQLite parser handles it; this file
 * only surfaces the metadata other modules need.
 *
 * `PRAGMA user_version` is intentionally NOT in `SQLITE_BOOT_PRAGMAS`.
 * It is written by the driver ONLY after a successful migration sweep,
 * so the boot-time read of `user_version` (which some tools use as a
 * fast "is the schema current?" hint) can never get ahead of the
 * authoritative `schema_migrations` table. See `sqlite-driver.ts`.
 */

export const PROPOSALS_SQLITE_SCHEMA_VERSION = 5;

export const SQLITE_BOOT_PRAGMAS = [
	'PRAGMA foreign_keys = ON;',
	'PRAGMA journal_mode = WAL;',
	'PRAGMA synchronous = NORMAL;',
	'PRAGMA busy_timeout = 5000;',
] as const;

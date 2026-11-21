/**
 * evidence-sqlite-schema.ts — f00533 S1.
 *
 * Physical schema for the evidence store's own SQLite database.
 *
 * Why a table at all: the file backend wrote one JSON document per
 * event. Measured on this repository on 2026-09-08, that was 25.533
 * files / 185 MB under `.cache/delendai/evidence`, at a typical size
 * of 289 bytes each — three orders of magnitude below a filesystem
 * block. One row per event is the shape this data always wanted.
 *
 * The database is deliberately NOT `proposals.sqlite` and NOT the
 * State Engine's store: evidence is session data with no external
 * consumers and no public format, so it gets its own file and can be
 * deleted wholesale without consequence.
 *
 * `STRICT` is on: every column is type-checked by SQLite itself, so a
 * malformed payload fails at the INSERT instead of at some later read.
 * `source_key` is the migrator's idempotency key (f00533 S3): it is
 * NULL for rows appended live, and `<type>/<file name>` for rows
 * imported from the legacy file layout. SQLite treats NULLs as
 * distinct in a UNIQUE index, so live appends are unconstrained while
 * a re-run of the migrator over a file it already imported is an
 * `INSERT OR IGNORE` no-op.
 */

/** Bumped only when the physical layout below changes. */
export const EVIDENCE_SCHEMA_VERSION = 1;

/**
 * WAL + NORMAL + a 5s busy timeout, matching `state-sqlite` and
 * `state-telemetry`. Foreign keys stay off: the table is standalone
 * and append-only, there is no referential integrity to enforce.
 */
export const EVIDENCE_BOOT_PRAGMAS = [
	'PRAGMA journal_mode = WAL;',
	'PRAGMA synchronous = NORMAL;',
	'PRAGMA busy_timeout = 5000;',
	'PRAGMA foreign_keys = OFF;',
] as const;

export const CREATE_EVIDENCE_TABLE_SQL = `
CREATE TABLE IF NOT EXISTS evidence (
	id INTEGER PRIMARY KEY AUTOINCREMENT,
	type TEXT NOT NULL,
	recorded_at INTEGER NOT NULL,
	payload TEXT NOT NULL,
	source_key TEXT
) STRICT;
`;

/** Serves `listByType` and the per-type prune. */
export const CREATE_EVIDENCE_TYPE_INDEX_SQL = `
CREATE INDEX IF NOT EXISTS idx_evidence_type
ON evidence(type, recorded_at);
`;

/** Serves the global age- and count-bounded prune. */
export const CREATE_EVIDENCE_RECORDED_AT_INDEX_SQL = `
CREATE INDEX IF NOT EXISTS idx_evidence_recorded_at
ON evidence(recorded_at);
`;

/** Idempotency key for the one-shot file migrator (f00533 S3). */
export const CREATE_EVIDENCE_SOURCE_KEY_INDEX_SQL = `
CREATE UNIQUE INDEX IF NOT EXISTS idx_evidence_source_key
ON evidence(source_key) WHERE source_key IS NOT NULL;
`;

export const EVIDENCE_SCHEMA_SQL = [
	CREATE_EVIDENCE_TABLE_SQL,
	CREATE_EVIDENCE_TYPE_INDEX_SQL,
	CREATE_EVIDENCE_RECORDED_AT_INDEX_SQL,
	CREATE_EVIDENCE_SOURCE_KEY_INDEX_SQL,
] as const;

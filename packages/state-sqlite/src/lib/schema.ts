export const STATE_SQLITE_SCHEMA_VERSION = 2;

export const SQLITE_BOOT_PRAGMAS = [
	'PRAGMA journal_mode = WAL;',
	'PRAGMA synchronous = NORMAL;',
	'PRAGMA busy_timeout = 5000;',
] as const;

// v2: one row per generation. v1 made `fingerprint` UNIQUE, but an
// incremental generation keeps its predecessor's input fingerprint (the
// change arrives as an event, not as new inputs), so the second row of
// any scope collided with SQLITE_CONSTRAINT_UNIQUE and the driver could
// never persist an incremental build over unchanged inputs.
export const CREATE_GENERATIONS_TABLE_SQL = `
CREATE TABLE IF NOT EXISTS generations (
	id INTEGER PRIMARY KEY AUTOINCREMENT,
	scope_kind TEXT NOT NULL,
	scope_locator_json TEXT NOT NULL,
	generation_id TEXT NOT NULL,
	snapshot_json TEXT NOT NULL,
	fingerprint TEXT NOT NULL,
	reconciled_commit_sha TEXT,
	schema_version INTEGER NOT NULL,
	created_at INTEGER NOT NULL,
	updated_at INTEGER NOT NULL,
	UNIQUE (scope_kind, scope_locator_json, generation_id)
);
`;

export const CREATE_GENERATIONS_SCOPE_INDEX_SQL = `
CREATE INDEX IF NOT EXISTS idx_generations_scope
ON generations(scope_kind, scope_locator_json);
`;

export const CREATE_DRIVERS_TABLE_SQL = `
CREATE TABLE IF NOT EXISTS drivers (
	fingerprint TEXT PRIMARY KEY,
	last_known_state TEXT NOT NULL CHECK (last_known_state IN ('primary','shadow','both')),
	parity_mismatches INTEGER NOT NULL DEFAULT 0
);
`;

export const STATE_SQLITE_SCHEMA_SQL = [
	CREATE_GENERATIONS_TABLE_SQL,
	CREATE_GENERATIONS_SCOPE_INDEX_SQL,
	`CREATE INDEX IF NOT EXISTS idx_generations_fingerprint
ON generations(fingerprint);`,
	CREATE_DRIVERS_TABLE_SQL,
] as const;

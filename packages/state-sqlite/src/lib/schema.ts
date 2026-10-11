import { CREATE_LIFECYCLE_META_TABLE_SQL } from './contracts/constants/lifecycle-meta.constant';

export const STATE_SQLITE_SCHEMA_VERSION = 3;

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

// v3: what coordinates the generations is stored with them. The counters
// fencing tokens, lease serials and generation ids are minted from; who
// holds which generation (a project lease is a holder of its kind); and
// the swarm claims in force.
export const CREATE_FENCING_TOKENS_TABLE_SQL = `
CREATE TABLE IF NOT EXISTS state_fencing_tokens (
	scope_kind TEXT NOT NULL,
	scope_locator_json TEXT NOT NULL,
	global_serial INTEGER NOT NULL,
	next_generation_serial INTEGER NOT NULL,
	next_project_lease_token INTEGER NOT NULL,
	next_project_lease_serial INTEGER NOT NULL,
	next_swarm_lease_token INTEGER NOT NULL,
	updated_at INTEGER NOT NULL,
	PRIMARY KEY (scope_kind, scope_locator_json)
);
`;

export const CREATE_HOLDERS_TABLE_SQL = `
CREATE TABLE IF NOT EXISTS state_holders (
	scope_kind TEXT NOT NULL,
	scope_locator_json TEXT NOT NULL,
	generation_id TEXT NOT NULL,
	holder_id TEXT NOT NULL,
	kind TEXT NOT NULL CHECK (kind IN ('reader','project-lease','swarm-claim','subagent')),
	acquired_at INTEGER NOT NULL,
	PRIMARY KEY (scope_kind, scope_locator_json, generation_id, holder_id)
);
`;

export const CREATE_SWARM_CLAIMS_TABLE_SQL = `
CREATE TABLE IF NOT EXISTS state_swarm_claims (
	scope_kind TEXT NOT NULL,
	scope_locator_json TEXT NOT NULL,
	slot TEXT NOT NULL,
	token INTEGER NOT NULL,
	holder_id TEXT NOT NULL,
	generation_id TEXT NOT NULL,
	PRIMARY KEY (scope_kind, scope_locator_json, slot)
);
`;

export const STATE_SQLITE_SCHEMA_SQL = [
	CREATE_GENERATIONS_TABLE_SQL,
	CREATE_GENERATIONS_SCOPE_INDEX_SQL,
	`CREATE INDEX IF NOT EXISTS idx_generations_fingerprint
ON generations(fingerprint);`,
	CREATE_DRIVERS_TABLE_SQL,
	CREATE_FENCING_TOKENS_TABLE_SQL,
	CREATE_HOLDERS_TABLE_SQL,
	CREATE_SWARM_CLAIMS_TABLE_SQL,
	CREATE_LIFECYCLE_META_TABLE_SQL,
] as const;

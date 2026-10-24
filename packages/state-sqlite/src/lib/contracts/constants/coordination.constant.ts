/**
 * coordination.constant.ts — the tables that keep what coordinates the
 * generations, and how often the log they are written to is checkpointed.
 */

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

/** The tables the coordination store owns, for a reset to empty in one place. */
export const COORDINATION_TABLES = [
	'state_fencing_tokens',
	'state_holders',
	'state_swarm_claims',
] as const;

/** Publishes between two passive WAL checkpoints, unless the caller says. */
export const DEFAULT_CHECKPOINT_EVERY_PUBLISHES = 64;

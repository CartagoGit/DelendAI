-- 0020 — every proposals table is STRICT (q00022 S1).
--
-- q00022 required every domain table to be STRICT, so a value of the
-- wrong type is refused at the write instead of being stored and found
-- later. Only `mutation_commands` (0006) was; the other twenty-four
-- accepted whatever they were given, because a SQLite column declared
-- INTEGER quietly stores the text 'abc' unless the table is STRICT.
--
-- SQLite cannot make a table STRICT in place, so each one is rebuilt
-- under the procedure SQLite documents: a STRICT copy with the identical
-- definition, the rows copied, the old table dropped, the copy renamed
-- into its place. The declared column types are INTEGER and TEXT only,
-- which STRICT accepts. A stored value that is not losslessly its column's
-- type makes the copy fail and the whole migration roll back: the
-- database is left exactly as it was, rather than rewritten with the
-- value changed.
--
-- Triggers are dropped first and recreated last: SQLite re-parses every
-- trigger when a table is renamed, and a trigger that names a table
-- mid-rebuild would fail that parse. Indexes go with their tables and are
-- recreated from their definitions. The FTS5 tables are virtual and keep
-- their own storage; they are not touched.
--
-- Generated from the schema 0001–0019 builds, so every definition below
-- is the one already in use.
--
-- delendai:rebuilds-tables

-- AUTOINCREMENT never reuses an id, and SQLite keeps that promise in
-- sqlite_sequence, whose row for a table goes with the table. Saved
-- before the rebuild and restored after it, never lowering a counter.
CREATE TEMP TABLE strict_rebuild_sequences AS
	SELECT name, seq FROM sqlite_sequence;

DROP TRIGGER "lifecycle_events_no_update";
DROP TRIGGER "lifecycle_events_no_delete";
DROP TRIGGER "plans_closed_at_matches_status_insert";
DROP TRIGGER "plans_closed_at_matches_status_update";
DROP TRIGGER "slices_closed_at_matches_status_insert";
DROP TRIGGER "slices_closed_at_matches_status_update";
DROP TRIGGER "proposals_fts_ai";
DROP TRIGGER "proposals_fts_au";
DROP TRIGGER "proposals_fts_ad";
DROP TRIGGER "plans_fts_ai";
DROP TRIGGER "plans_fts_au";
DROP TRIGGER "plans_fts_ad";
DROP TRIGGER "slices_fts_ai";
DROP TRIGGER "slices_fts_au";
DROP TRIGGER "slices_fts_ad";
DROP TRIGGER "coordination_journal_no_update";
DROP TRIGGER "coordination_journal_no_delete";
DROP TRIGGER "proposals_revision_steps_by_one";
DROP TRIGGER "plans_revision_steps_by_one";
DROP TRIGGER "slices_revision_steps_by_one";

CREATE TABLE "schema_migrations__strict" (
			version INTEGER PRIMARY KEY,
			name TEXT NOT NULL,
			checksum TEXT NOT NULL,
			applied_at INTEGER NOT NULL
		) STRICT;
INSERT INTO "schema_migrations__strict" ("version", "name", "checksum", "applied_at") SELECT "version", "name", "checksum", "applied_at" FROM "schema_migrations";
DROP TABLE "schema_migrations";
ALTER TABLE "schema_migrations__strict" RENAME TO "schema_migrations";

CREATE TABLE "reconciliation_runs__strict" (
	id INTEGER PRIMARY KEY AUTOINCREMENT,
	source_commit TEXT,
	source_tree TEXT,
	reconciler_version TEXT NOT NULL,
	schema_version INTEGER NOT NULL,
	started_at INTEGER NOT NULL,
	completed_at INTEGER,
	status TEXT NOT NULL CHECK (
		status IN ('ok', 'degraded', 'failed')
	),
	files_seen INTEGER NOT NULL DEFAULT 0,
	files_changed INTEGER NOT NULL DEFAULT 0,
	entities_created INTEGER NOT NULL DEFAULT 0,
	entities_updated INTEGER NOT NULL DEFAULT 0,
	entities_deleted INTEGER NOT NULL DEFAULT 0,
	entities_quarantined INTEGER NOT NULL DEFAULT 0,
	logical_digest TEXT,
	kind TEXT NOT NULL DEFAULT 'incremental' CHECK (
		kind IN ('incremental', 'shadow', 'promote', 'rebuild')
	),
	error TEXT
) STRICT;
INSERT INTO "reconciliation_runs__strict" ("id", "source_commit", "source_tree", "reconciler_version", "schema_version", "started_at", "completed_at", "status", "files_seen", "files_changed", "entities_created", "entities_updated", "entities_deleted", "entities_quarantined", "logical_digest", "kind", "error") SELECT "id", "source_commit", "source_tree", "reconciler_version", "schema_version", "started_at", "completed_at", "status", "files_seen", "files_changed", "entities_created", "entities_updated", "entities_deleted", "entities_quarantined", "logical_digest", "kind", "error" FROM "reconciliation_runs";
DROP TABLE "reconciliation_runs";
ALTER TABLE "reconciliation_runs__strict" RENAME TO "reconciliation_runs";

CREATE TABLE "lifecycle_events__strict" (
	id INTEGER PRIMARY KEY AUTOINCREMENT,
	entity_type TEXT NOT NULL CHECK (
		entity_type IN ('proposal', 'plan', 'slice')
	),
	entity_uid TEXT NOT NULL,
	entity_revision INTEGER NOT NULL,
	from_status TEXT,
	to_status TEXT NOT NULL,
	actor TEXT NOT NULL,
	source TEXT NOT NULL,
	occurred_at INTEGER NOT NULL,
	metadata TEXT
) STRICT;
INSERT INTO "lifecycle_events__strict" ("id", "entity_type", "entity_uid", "entity_revision", "from_status", "to_status", "actor", "source", "occurred_at", "metadata") SELECT "id", "entity_type", "entity_uid", "entity_revision", "from_status", "to_status", "actor", "source", "occurred_at", "metadata" FROM "lifecycle_events";
DROP TABLE "lifecycle_events";
ALTER TABLE "lifecycle_events__strict" RENAME TO "lifecycle_events";

CREATE TABLE "outbox__strict" (
	id INTEGER PRIMARY KEY AUTOINCREMENT,
	idempotency_key TEXT UNIQUE NOT NULL,
	kind TEXT NOT NULL,
	payload TEXT NOT NULL,
	status TEXT NOT NULL DEFAULT 'pending' CHECK (
		status IN ('pending', 'in-flight', 'done', 'failed')
	),
	attempts INTEGER NOT NULL DEFAULT 0,
	last_error TEXT,
	next_attempt_at INTEGER NOT NULL,
	created_at INTEGER NOT NULL,
	updated_at INTEGER NOT NULL
, lease_owner TEXT, lease_expires_at INTEGER) STRICT;
INSERT INTO "outbox__strict" ("id", "idempotency_key", "kind", "payload", "status", "attempts", "last_error", "next_attempt_at", "created_at", "updated_at", "lease_owner", "lease_expires_at") SELECT "id", "idempotency_key", "kind", "payload", "status", "attempts", "last_error", "next_attempt_at", "created_at", "updated_at", "lease_owner", "lease_expires_at" FROM "outbox";
DROP TABLE "outbox";
ALTER TABLE "outbox__strict" RENAME TO "outbox";

CREATE TABLE "quarantine__strict" (
	id INTEGER PRIMARY KEY AUTOINCREMENT,
	source_path TEXT NOT NULL,
	blob_sha TEXT NOT NULL,
	entity_guess TEXT,
	error_code TEXT NOT NULL,
	error_message TEXT NOT NULL,
	raw_metadata TEXT,
	run_id INTEGER REFERENCES reconciliation_runs(id),
	status TEXT NOT NULL DEFAULT 'pending' CHECK (
		status IN ('pending', 'resolved', 'ignored')
	),
	created_at INTEGER NOT NULL,
	updated_at INTEGER NOT NULL,
	resolved_at INTEGER,
	resolved_by TEXT,
	resolution_note TEXT
) STRICT;
INSERT INTO "quarantine__strict" ("id", "source_path", "blob_sha", "entity_guess", "error_code", "error_message", "raw_metadata", "run_id", "status", "created_at", "updated_at", "resolved_at", "resolved_by", "resolution_note") SELECT "id", "source_path", "blob_sha", "entity_guess", "error_code", "error_message", "raw_metadata", "run_id", "status", "created_at", "updated_at", "resolved_at", "resolved_by", "resolution_note" FROM "quarantine";
DROP TABLE "quarantine";
ALTER TABLE "quarantine__strict" RENAME TO "quarantine";

CREATE TABLE "path_history__strict" (
	id INTEGER PRIMARY KEY AUTOINCREMENT,
	entity_type TEXT NOT NULL CHECK (
		entity_type IN ('proposal', 'plan', 'slice')
	),
	entity_uid TEXT NOT NULL,
	from_path TEXT NOT NULL,
	to_path TEXT NOT NULL,
	changed_at INTEGER NOT NULL,
	source_commit TEXT NOT NULL
) STRICT;
INSERT INTO "path_history__strict" ("id", "entity_type", "entity_uid", "from_path", "to_path", "changed_at", "source_commit") SELECT "id", "entity_type", "entity_uid", "from_path", "to_path", "changed_at", "source_commit" FROM "path_history";
DROP TABLE "path_history";
ALTER TABLE "path_history__strict" RENAME TO "path_history";

CREATE TABLE "tombstones__strict" (
	id INTEGER PRIMARY KEY AUTOINCREMENT,
	entity_type TEXT NOT NULL CHECK (
		entity_type IN ('proposal', 'plan', 'slice')
	),
	entity_uid TEXT NOT NULL,
	reason TEXT NOT NULL CHECK (
		reason IN (
			'git-removed',
			'renamed',
			'moved-by-reorg',
			'unknown'
		)
	),
	deleted_at INTEGER NOT NULL,
	last_seen_at INTEGER NOT NULL,
	last_seen_commit TEXT NOT NULL
) STRICT;
INSERT INTO "tombstones__strict" ("id", "entity_type", "entity_uid", "reason", "deleted_at", "last_seen_at", "last_seen_commit") SELECT "id", "entity_type", "entity_uid", "reason", "deleted_at", "last_seen_at", "last_seen_commit" FROM "tombstones";
DROP TABLE "tombstones";
ALTER TABLE "tombstones__strict" RENAME TO "tombstones";

CREATE TABLE "proposals__strict" (
	id INTEGER PRIMARY KEY AUTOINCREMENT,
	uid TEXT UNIQUE NOT NULL,
	slug TEXT NOT NULL,
	kind TEXT NOT NULL CHECK (
		kind IN (
			'feat',
			'breaking',
			'fix',
			'refactor',
			'perf',
			'audit',
			'chore',
			'docs',
			'test',
			'infra',
			'spike',
			'plan',
			'resume',
			'repair',
			'legacy'
		)
	),
	status TEXT NOT NULL CHECK (
		status IN (
			'draft',
			'ready',
			'in-progress',
			'review',
			'blocked',
			'paused',
			'done',
			'retired',
			'superseded',
			'quarantined'
		)
	),
	title TEXT NOT NULL,
	source_path TEXT,
	source_blob_sha TEXT,
	revision INTEGER NOT NULL DEFAULT 0 CHECK (revision >= 0),
	content_hash TEXT,
	created_at INTEGER NOT NULL,
	updated_at INTEGER NOT NULL,
	closed_at INTEGER,
	deleted_at INTEGER,
	last_seen_at INTEGER,
	last_seen_commit TEXT,
	tombstone_reason TEXT
) STRICT;
INSERT INTO "proposals__strict" ("id", "uid", "slug", "kind", "status", "title", "source_path", "source_blob_sha", "revision", "content_hash", "created_at", "updated_at", "closed_at", "deleted_at", "last_seen_at", "last_seen_commit", "tombstone_reason") SELECT "id", "uid", "slug", "kind", "status", "title", "source_path", "source_blob_sha", "revision", "content_hash", "created_at", "updated_at", "closed_at", "deleted_at", "last_seen_at", "last_seen_commit", "tombstone_reason" FROM "proposals";
DROP TABLE "proposals";
ALTER TABLE "proposals__strict" RENAME TO "proposals";

CREATE TABLE "plans__strict" (
	id INTEGER PRIMARY KEY AUTOINCREMENT,
	uid TEXT UNIQUE NOT NULL,
	proposal_id INTEGER NOT NULL REFERENCES proposals(id) ON DELETE RESTRICT,
	slug TEXT NOT NULL,
	title TEXT NOT NULL,
	source_path TEXT,
	revision INTEGER NOT NULL DEFAULT 0 CHECK (revision >= 0),
	created_at INTEGER NOT NULL,
	updated_at INTEGER NOT NULL,
	closed_at INTEGER,
	deleted_at INTEGER,
	last_seen_at INTEGER,
	last_seen_commit TEXT,
	tombstone_reason TEXT,
	status TEXT NOT NULL DEFAULT 'ready' CHECK (
		status IN (
			'draft',
			'ready',
			'in-progress',
			'review',
			'blocked',
			'paused',
			'done',
			'retired',
			'superseded',
			'quarantined'
		)
	)
) STRICT;
INSERT INTO "plans__strict" ("id", "uid", "proposal_id", "slug", "title", "source_path", "revision", "created_at", "updated_at", "closed_at", "deleted_at", "last_seen_at", "last_seen_commit", "tombstone_reason", "status") SELECT "id", "uid", "proposal_id", "slug", "title", "source_path", "revision", "created_at", "updated_at", "closed_at", "deleted_at", "last_seen_at", "last_seen_commit", "tombstone_reason", "status" FROM "plans";
DROP TABLE "plans";
ALTER TABLE "plans__strict" RENAME TO "plans";

CREATE TABLE "slices__strict" (
	id INTEGER PRIMARY KEY AUTOINCREMENT,
	uid TEXT UNIQUE NOT NULL,
	plan_id INTEGER NOT NULL REFERENCES plans(id) ON DELETE RESTRICT,
	slug TEXT NOT NULL,
	title TEXT NOT NULL,
	source_path TEXT,
	revision INTEGER NOT NULL DEFAULT 0 CHECK (revision >= 0),
	created_at INTEGER NOT NULL,
	updated_at INTEGER NOT NULL,
	closed_at INTEGER,
	deleted_at INTEGER,
	last_seen_at INTEGER,
	last_seen_commit TEXT,
	tombstone_reason TEXT,
	status TEXT NOT NULL DEFAULT 'ready' CHECK (
		status IN (
			'draft',
			'ready',
			'in-progress',
			'review',
			'blocked',
			'paused',
			'done',
			'retired',
			'superseded',
			'quarantined'
		)
	)
) STRICT;
INSERT INTO "slices__strict" ("id", "uid", "plan_id", "slug", "title", "source_path", "revision", "created_at", "updated_at", "closed_at", "deleted_at", "last_seen_at", "last_seen_commit", "tombstone_reason", "status") SELECT "id", "uid", "plan_id", "slug", "title", "source_path", "revision", "created_at", "updated_at", "closed_at", "deleted_at", "last_seen_at", "last_seen_commit", "tombstone_reason", "status" FROM "slices";
DROP TABLE "slices";
ALTER TABLE "slices__strict" RENAME TO "slices";

CREATE TABLE "summary_cache__strict" (
	content_hash TEXT PRIMARY KEY,
	summary TEXT NOT NULL,
	summary_model TEXT NOT NULL,
	summary_prompt_version TEXT NOT NULL,
	created_at INTEGER NOT NULL
) STRICT;
INSERT INTO "summary_cache__strict" ("content_hash", "summary", "summary_model", "summary_prompt_version", "created_at") SELECT "content_hash", "summary", "summary_model", "summary_prompt_version", "created_at" FROM "summary_cache";
DROP TABLE "summary_cache";
ALTER TABLE "summary_cache__strict" RENAME TO "summary_cache";

CREATE TABLE "compile_runs__strict" (
	id INTEGER PRIMARY KEY AUTOINCREMENT,
	rows_considered INTEGER NOT NULL,
	rows_emitted INTEGER NOT NULL,
	tokens_input INTEGER NOT NULL,
	tokens_output INTEGER NOT NULL,
	cache_hits INTEGER NOT NULL,
	duration_ms INTEGER NOT NULL,
	created_at INTEGER NOT NULL
) STRICT;
INSERT INTO "compile_runs__strict" ("id", "rows_considered", "rows_emitted", "tokens_input", "tokens_output", "cache_hits", "duration_ms", "created_at") SELECT "id", "rows_considered", "rows_emitted", "tokens_input", "tokens_output", "cache_hits", "duration_ms", "created_at" FROM "compile_runs";
DROP TABLE "compile_runs";
ALTER TABLE "compile_runs__strict" RENAME TO "compile_runs";

CREATE TABLE "repositories__strict" (
	id INTEGER PRIMARY KEY AUTOINCREMENT,
	forge TEXT NOT NULL CHECK (
		forge IN ('github', 'gitlab', 'gitea', 'local')
	),
	owner TEXT NOT NULL,
	name TEXT NOT NULL,
	integration_branch TEXT NOT NULL,
	release_branch TEXT NOT NULL,
	created_at INTEGER NOT NULL,
	updated_at INTEGER NOT NULL,
	UNIQUE (forge, owner, name)
) STRICT;
INSERT INTO "repositories__strict" ("id", "forge", "owner", "name", "integration_branch", "release_branch", "created_at", "updated_at") SELECT "id", "forge", "owner", "name", "integration_branch", "release_branch", "created_at", "updated_at" FROM "repositories";
DROP TABLE "repositories";
ALTER TABLE "repositories__strict" RENAME TO "repositories";

CREATE TABLE "machines__strict" (
	machine_id TEXT PRIMARY KEY,
	hostname TEXT NOT NULL,
	platform TEXT,
	first_seen INTEGER NOT NULL,
	last_seen INTEGER NOT NULL,
	CHECK (last_seen >= first_seen)
) STRICT;
INSERT INTO "machines__strict" ("machine_id", "hostname", "platform", "first_seen", "last_seen") SELECT "machine_id", "hostname", "platform", "first_seen", "last_seen" FROM "machines";
DROP TABLE "machines";
ALTER TABLE "machines__strict" RENAME TO "machines";

CREATE TABLE "agents__strict" (
	id TEXT PRIMARY KEY,
	host TEXT NOT NULL,
	model TEXT,
	machine_id TEXT NOT NULL REFERENCES machines(machine_id) ON DELETE RESTRICT,
	state TEXT NOT NULL CHECK (
		state IN ('idle', 'working', 'blocked', 'offline')
	),
	first_seen INTEGER NOT NULL,
	last_seen INTEGER NOT NULL
) STRICT;
INSERT INTO "agents__strict" ("id", "host", "model", "machine_id", "state", "first_seen", "last_seen") SELECT "id", "host", "model", "machine_id", "state", "first_seen", "last_seen" FROM "agents";
DROP TABLE "agents";
ALTER TABLE "agents__strict" RENAME TO "agents";

CREATE TABLE "leases__strict" (
	id TEXT PRIMARY KEY,
	owner_agent_id TEXT NOT NULL REFERENCES agents(id) ON DELETE RESTRICT,
	machine_id TEXT NOT NULL REFERENCES machines(machine_id) ON DELETE RESTRICT,
	process_id INTEGER,
	session_id TEXT,
	acquired_at INTEGER NOT NULL,
	heartbeat_at INTEGER NOT NULL,
	expires_at INTEGER NOT NULL,
	released_at INTEGER,
	CHECK (expires_at > acquired_at),
	CHECK (heartbeat_at >= acquired_at)
) STRICT;
INSERT INTO "leases__strict" ("id", "owner_agent_id", "machine_id", "process_id", "session_id", "acquired_at", "heartbeat_at", "expires_at", "released_at") SELECT "id", "owner_agent_id", "machine_id", "process_id", "session_id", "acquired_at", "heartbeat_at", "expires_at", "released_at" FROM "leases";
DROP TABLE "leases";
ALTER TABLE "leases__strict" RENAME TO "leases";

CREATE TABLE "pull_requests__strict" (
	id INTEGER PRIMARY KEY AUTOINCREMENT,
	repository_id INTEGER NOT NULL REFERENCES repositories(id) ON DELETE RESTRICT,
	number INTEGER NOT NULL CHECK (number > 0),
	head_ref TEXT NOT NULL,
	base_ref TEXT NOT NULL,
	head_sha TEXT NOT NULL,
	state TEXT NOT NULL CHECK (
		state IN ('draft', 'open', 'closed', 'merged')
	),
	merge_sha TEXT,
	created_at INTEGER NOT NULL,
	updated_at INTEGER NOT NULL,
	UNIQUE (repository_id, number),
	CHECK (state <> 'merged' OR merge_sha IS NOT NULL)
) STRICT;
INSERT INTO "pull_requests__strict" ("id", "repository_id", "number", "head_ref", "base_ref", "head_sha", "state", "merge_sha", "created_at", "updated_at") SELECT "id", "repository_id", "number", "head_ref", "base_ref", "head_sha", "state", "merge_sha", "created_at", "updated_at" FROM "pull_requests";
DROP TABLE "pull_requests";
ALTER TABLE "pull_requests__strict" RENAME TO "pull_requests";

CREATE TABLE "ci_runs__strict" (
	id INTEGER PRIMARY KEY AUTOINCREMENT,
	repository_id INTEGER NOT NULL REFERENCES repositories(id) ON DELETE RESTRICT,
	candidate_sha TEXT NOT NULL,
	workflow TEXT NOT NULL,
	check_name TEXT NOT NULL,
	external_id TEXT,
	state TEXT NOT NULL CHECK (
		state IN (
			'queued',
			'in_progress',
			'success',
			'failure',
			'cancelled',
			'timed_out',
			'neutral'
		)
	),
	started_at INTEGER,
	completed_at INTEGER,
	created_at INTEGER NOT NULL,
	updated_at INTEGER NOT NULL,
	UNIQUE (repository_id, candidate_sha, workflow, check_name)
) STRICT;
INSERT INTO "ci_runs__strict" ("id", "repository_id", "candidate_sha", "workflow", "check_name", "external_id", "state", "started_at", "completed_at", "created_at", "updated_at") SELECT "id", "repository_id", "candidate_sha", "workflow", "check_name", "external_id", "state", "started_at", "completed_at", "created_at", "updated_at" FROM "ci_runs";
DROP TABLE "ci_runs";
ALTER TABLE "ci_runs__strict" RENAME TO "ci_runs";

CREATE TABLE "claims__strict" (
	id INTEGER PRIMARY KEY AUTOINCREMENT,
	repository_id INTEGER NOT NULL REFERENCES repositories(id) ON DELETE RESTRICT,
	path TEXT NOT NULL,
	owner_agent_id TEXT NOT NULL REFERENCES agents(id) ON DELETE RESTRICT,
	lease_id TEXT NOT NULL REFERENCES leases(id) ON DELETE RESTRICT,
	work_unit_id INTEGER NOT NULL REFERENCES work_units(id) ON DELETE RESTRICT,
	generation INTEGER CHECK (generation IS NULL OR generation >= 1),
	claimed_at INTEGER NOT NULL,
	released_at INTEGER
) STRICT;
INSERT INTO "claims__strict" ("id", "repository_id", "path", "owner_agent_id", "lease_id", "work_unit_id", "generation", "claimed_at", "released_at") SELECT "id", "repository_id", "path", "owner_agent_id", "lease_id", "work_unit_id", "generation", "claimed_at", "released_at" FROM "claims";
DROP TABLE "claims";
ALTER TABLE "claims__strict" RENAME TO "claims";

CREATE TABLE "work_reconciliation_runs__strict" (
	id INTEGER PRIMARY KEY AUTOINCREMENT,
	machine_id TEXT NOT NULL REFERENCES machines(machine_id) ON DELETE RESTRICT,
	repository_id INTEGER REFERENCES repositories(id) ON DELETE RESTRICT,
	started_at INTEGER NOT NULL,
	completed_at INTEGER,
	status TEXT NOT NULL CHECK (status IN ('running', 'ok', 'degraded', 'failed')),
	refs_discovered INTEGER NOT NULL DEFAULT 0,
	work_units_repaired INTEGER NOT NULL DEFAULT 0,
	generations_repaired INTEGER NOT NULL DEFAULT 0,
	claims_released INTEGER NOT NULL DEFAULT 0,
	anomalies_json TEXT CHECK (anomalies_json IS NULL OR json_valid(anomalies_json)),
	error TEXT
) STRICT;
INSERT INTO "work_reconciliation_runs__strict" ("id", "machine_id", "repository_id", "started_at", "completed_at", "status", "refs_discovered", "work_units_repaired", "generations_repaired", "claims_released", "anomalies_json", "error") SELECT "id", "machine_id", "repository_id", "started_at", "completed_at", "status", "refs_discovered", "work_units_repaired", "generations_repaired", "claims_released", "anomalies_json", "error" FROM "work_reconciliation_runs";
DROP TABLE "work_reconciliation_runs";
ALTER TABLE "work_reconciliation_runs__strict" RENAME TO "work_reconciliation_runs";

CREATE TABLE "coordination_journal__strict" (
	id INTEGER PRIMARY KEY AUTOINCREMENT,
	event_id TEXT NOT NULL UNIQUE,
	event_kind TEXT NOT NULL CHECK (
		event_kind IN (
			'owner-changed',
			'slice-recovered',
			'slice-deprecated',
			'semantic-checkpoint',
			'recovery-decision',
			'migration-applied',
			'reconciliation-outcome'
		)
	),
	repository_uid TEXT,
	work_unit_uid TEXT,
	proposal_uid TEXT,
	slice_uid TEXT,
	generation INTEGER CHECK (generation IS NULL OR generation >= 1),
	actor_agent_id TEXT,
	machine_id TEXT,
	occurred_at INTEGER NOT NULL,
	recorded_at INTEGER NOT NULL,
	payload_json TEXT NOT NULL DEFAULT '{}' CHECK (json_valid(payload_json))
) STRICT;
INSERT INTO "coordination_journal__strict" ("id", "event_id", "event_kind", "repository_uid", "work_unit_uid", "proposal_uid", "slice_uid", "generation", "actor_agent_id", "machine_id", "occurred_at", "recorded_at", "payload_json") SELECT "id", "event_id", "event_kind", "repository_uid", "work_unit_uid", "proposal_uid", "slice_uid", "generation", "actor_agent_id", "machine_id", "occurred_at", "recorded_at", "payload_json" FROM "coordination_journal";
DROP TABLE "coordination_journal";
ALTER TABLE "coordination_journal__strict" RENAME TO "coordination_journal";

CREATE TABLE "work_units__strict" (
	id INTEGER PRIMARY KEY AUTOINCREMENT,
	uid TEXT NOT NULL UNIQUE,
	repository_id INTEGER NOT NULL REFERENCES repositories(id) ON DELETE RESTRICT,
	proposal_uid TEXT NOT NULL,
	slice_uid TEXT NOT NULL,
	state TEXT NOT NULL CHECK (
		state IN (
			'pending',
			'claimed',
			'in-progress',
			'recoverable',
			'integrating',
			'integrated',
			'deprecated'
		)
	),
	current_generation INTEGER NOT NULL DEFAULT 0 CHECK (current_generation >= 0),
	current_owner_agent_id TEXT,
	created_by_agent_id TEXT NOT NULL,
	revision INTEGER NOT NULL DEFAULT 0 CHECK (revision >= 0),
	created_at INTEGER NOT NULL,
	updated_at INTEGER NOT NULL,
	closed_at INTEGER,
	UNIQUE (repository_id, proposal_uid, slice_uid)
) STRICT;
INSERT INTO "work_units__strict" ("id", "uid", "repository_id", "proposal_uid", "slice_uid", "state", "current_generation", "current_owner_agent_id", "created_by_agent_id", "revision", "created_at", "updated_at", "closed_at") SELECT "id", "uid", "repository_id", "proposal_uid", "slice_uid", "state", "current_generation", "current_owner_agent_id", "created_by_agent_id", "revision", "created_at", "updated_at", "closed_at" FROM "work_units";
DROP TABLE "work_units";
ALTER TABLE "work_units__strict" RENAME TO "work_units";

CREATE TABLE "work_unit_owners__strict" (
	id INTEGER PRIMARY KEY AUTOINCREMENT,
	work_unit_id INTEGER NOT NULL REFERENCES work_units(id) ON DELETE RESTRICT,
	seq INTEGER NOT NULL CHECK (seq >= 0),
	agent_id TEXT NOT NULL,
	reason TEXT NOT NULL CHECK (
		reason IN ('created', 'claimed', 'recovered', 'handoff', 'released', 'expired')
	),
	acquired_at INTEGER NOT NULL,
	released_at INTEGER,
	UNIQUE (work_unit_id, seq)
) STRICT;
INSERT INTO "work_unit_owners__strict" ("id", "work_unit_id", "seq", "agent_id", "reason", "acquired_at", "released_at") SELECT "id", "work_unit_id", "seq", "agent_id", "reason", "acquired_at", "released_at" FROM "work_unit_owners";
DROP TABLE "work_unit_owners";
ALTER TABLE "work_unit_owners__strict" RENAME TO "work_unit_owners";

CREATE TABLE "generations__strict" (
	id INTEGER PRIMARY KEY AUTOINCREMENT,
	work_unit_id INTEGER NOT NULL REFERENCES work_units(id) ON DELETE RESTRICT,
	generation INTEGER NOT NULL CHECK (generation >= 1),
	base_integration_sha TEXT NOT NULL,
	wip_ref TEXT NOT NULL,
	wip_head_sha TEXT NOT NULL,
	patch_digest TEXT NOT NULL,
	file_scope_json TEXT NOT NULL CHECK (json_valid(file_scope_json)),
	file_scope_digest TEXT NOT NULL,
	checkpoint_kind TEXT NOT NULL CHECK (
		checkpoint_kind IN ('durability', 'merge-candidate')
	),
	candidate_state TEXT NOT NULL CHECK (
		candidate_state IN (
			'draft',
			'proposed',
			'integrating',
			'integrated',
			'superseded',
			'abandoned'
		)
	),
	validation_state TEXT NOT NULL CHECK (
		validation_state IN ('unknown', 'pending', 'green', 'red', 'skipped')
	),
	author_agent_id TEXT NOT NULL,
	machine_id TEXT NOT NULL REFERENCES machines(machine_id) ON DELETE RESTRICT,
	pull_request_id INTEGER REFERENCES pull_requests(id) ON DELETE RESTRICT,
	ci_result TEXT CHECK (
		ci_result IS NULL
		OR ci_result IN (
			'pending',
			'success',
			'failure',
			'cancelled',
			'timed_out',
			'neutral'
		)
	),
	integrated_sha TEXT,
	revision INTEGER NOT NULL DEFAULT 0 CHECK (revision >= 0),
	created_at INTEGER NOT NULL,
	updated_at INTEGER NOT NULL,
	UNIQUE (work_unit_id, generation),
	-- A durability checkpoint exists so work is not lost; it is never
	-- the thing that gets merged. Only a merge-candidate may integrate.
	CHECK (checkpoint_kind = 'merge-candidate' OR integrated_sha IS NULL),
	CHECK (candidate_state <> 'integrated' OR integrated_sha IS NOT NULL)
) STRICT;
INSERT INTO "generations__strict" ("id", "work_unit_id", "generation", "base_integration_sha", "wip_ref", "wip_head_sha", "patch_digest", "file_scope_json", "file_scope_digest", "checkpoint_kind", "candidate_state", "validation_state", "author_agent_id", "machine_id", "pull_request_id", "ci_result", "integrated_sha", "revision", "created_at", "updated_at") SELECT "id", "work_unit_id", "generation", "base_integration_sha", "wip_ref", "wip_head_sha", "patch_digest", "file_scope_json", "file_scope_digest", "checkpoint_kind", "candidate_state", "validation_state", "author_agent_id", "machine_id", "pull_request_id", "ci_result", "integrated_sha", "revision", "created_at", "updated_at" FROM "generations";
DROP TABLE "generations";
ALTER TABLE "generations__strict" RENAME TO "generations";

UPDATE sqlite_sequence
	SET seq = (
		SELECT saved.seq FROM strict_rebuild_sequences AS saved
		WHERE saved.name = sqlite_sequence.name
	)
	WHERE seq < (
		SELECT saved.seq FROM strict_rebuild_sequences AS saved
		WHERE saved.name = sqlite_sequence.name
	);
INSERT INTO sqlite_sequence (name, seq)
	SELECT name, seq FROM strict_rebuild_sequences
	WHERE name NOT IN (SELECT name FROM sqlite_sequence);
DROP TABLE strict_rebuild_sequences;

CREATE INDEX idx_runs_source_commit ON reconciliation_runs(source_commit);
CREATE INDEX idx_runs_status ON reconciliation_runs(status);
CREATE INDEX idx_lifecycle_entity
	ON lifecycle_events(entity_type, entity_uid);
CREATE INDEX idx_lifecycle_occurred_at
	ON lifecycle_events(occurred_at);
CREATE INDEX idx_outbox_status ON outbox(status);
CREATE INDEX idx_outbox_next_attempt_at
	ON outbox(next_attempt_at);
CREATE INDEX idx_quarantine_status ON quarantine(status);
CREATE INDEX idx_path_history_entity
	ON path_history(entity_type, entity_uid);
CREATE INDEX idx_tombstones_entity
	ON tombstones(entity_type, entity_uid);
CREATE INDEX idx_outbox_lease_recovery
	ON outbox(status, lease_expires_at, next_attempt_at);
CREATE INDEX idx_proposals_status ON proposals(status);
CREATE INDEX idx_proposals_kind ON proposals(kind);
CREATE INDEX idx_plans_proposal_id ON plans(proposal_id);
CREATE INDEX idx_slices_plan_id ON slices(plan_id);
CREATE UNIQUE INDEX idx_path_history_transition
	ON path_history(entity_type, entity_uid, from_path, to_path, source_commit);
CREATE INDEX idx_path_history_changed_at
	ON path_history(changed_at, entity_type, entity_uid);
CREATE UNIQUE INDEX idx_tombstones_observation
	ON tombstones(entity_type, entity_uid, deleted_at, last_seen_commit);
CREATE INDEX idx_tombstones_deleted_at
	ON tombstones(deleted_at, entity_type, entity_uid);
CREATE INDEX idx_agents_machine ON agents(machine_id);
CREATE INDEX idx_agents_state ON agents(state);
CREATE INDEX idx_leases_owner ON leases(owner_agent_id);
CREATE INDEX idx_leases_expiry ON leases(expires_at, released_at);
CREATE INDEX idx_pull_requests_head_sha
	ON pull_requests(repository_id, head_sha);
CREATE INDEX idx_ci_runs_candidate
	ON ci_runs(repository_id, candidate_sha);
CREATE UNIQUE INDEX idx_claims_active_path
	ON claims(repository_id, path) WHERE released_at IS NULL;
CREATE INDEX idx_claims_work_unit ON claims(work_unit_id);
CREATE INDEX idx_claims_lease ON claims(lease_id);
CREATE INDEX idx_work_reconciliation_runs_machine
	ON work_reconciliation_runs(machine_id, started_at);
CREATE INDEX idx_coordination_journal_subject
	ON coordination_journal(work_unit_uid, occurred_at, id);
CREATE INDEX idx_coordination_journal_kind
	ON coordination_journal(event_kind, occurred_at);
CREATE INDEX idx_coordination_journal_slice
	ON coordination_journal(proposal_uid, slice_uid, occurred_at);
CREATE INDEX idx_work_units_state ON work_units(state);
CREATE INDEX idx_work_units_owner
	ON work_units(current_owner_agent_id);
CREATE INDEX idx_work_units_slice
	ON work_units(proposal_uid, slice_uid);
CREATE INDEX idx_work_unit_owners_agent
	ON work_unit_owners(agent_id);
CREATE INDEX idx_generations_wip_head
	ON generations(wip_head_sha);
CREATE INDEX idx_generations_candidate_state
	ON generations(candidate_state);
CREATE INDEX idx_generations_pull_request
	ON generations(pull_request_id);

CREATE TRIGGER lifecycle_events_no_update
BEFORE UPDATE ON lifecycle_events
BEGIN
	SELECT RAISE(ABORT, 'lifecycle_events is append-only');
END;
CREATE TRIGGER lifecycle_events_no_delete
BEFORE DELETE ON lifecycle_events
BEGIN
	SELECT RAISE(ABORT, 'lifecycle_events is append-only');
END;
CREATE TRIGGER plans_closed_at_matches_status_insert
BEFORE INSERT ON plans
WHEN (
	(NEW.status IN ('done', 'retired', 'superseded', 'quarantined') AND NEW.closed_at IS NULL)
	OR
	(NEW.status NOT IN ('done', 'retired', 'superseded', 'quarantined') AND NEW.closed_at IS NOT NULL)
)
BEGIN
	SELECT RAISE(ABORT, 'plans.closed_at must match terminal status');
END;
CREATE TRIGGER plans_closed_at_matches_status_update
BEFORE UPDATE ON plans
WHEN (
	(NEW.status IN ('done', 'retired', 'superseded', 'quarantined') AND NEW.closed_at IS NULL)
	OR
	(NEW.status NOT IN ('done', 'retired', 'superseded', 'quarantined') AND NEW.closed_at IS NOT NULL)
)
BEGIN
	SELECT RAISE(ABORT, 'plans.closed_at must match terminal status');
END;
CREATE TRIGGER slices_closed_at_matches_status_insert
BEFORE INSERT ON slices
WHEN (
	(NEW.status IN ('done', 'retired', 'superseded', 'quarantined') AND NEW.closed_at IS NULL)
	OR
	(NEW.status NOT IN ('done', 'retired', 'superseded', 'quarantined') AND NEW.closed_at IS NOT NULL)
)
BEGIN
	SELECT RAISE(ABORT, 'slices.closed_at must match terminal status');
END;
CREATE TRIGGER slices_closed_at_matches_status_update
BEFORE UPDATE ON slices
WHEN (
	(NEW.status IN ('done', 'retired', 'superseded', 'quarantined') AND NEW.closed_at IS NULL)
	OR
	(NEW.status NOT IN ('done', 'retired', 'superseded', 'quarantined') AND NEW.closed_at IS NOT NULL)
)
BEGIN
	SELECT RAISE(ABORT, 'slices.closed_at must match terminal status');
END;
CREATE TRIGGER proposals_fts_ai
AFTER INSERT ON proposals
BEGIN
	INSERT INTO proposals_fts (uid, title, body)
	VALUES (NEW.uid, NEW.title, '');
END;
CREATE TRIGGER proposals_fts_au
AFTER UPDATE ON proposals
BEGIN
	UPDATE proposals_fts
	SET title = NEW.title
	WHERE uid = OLD.uid;
END;
CREATE TRIGGER proposals_fts_ad
AFTER DELETE ON proposals
BEGIN
	DELETE FROM proposals_fts WHERE uid = OLD.uid;
END;
CREATE TRIGGER plans_fts_ai
AFTER INSERT ON plans
BEGIN
	INSERT INTO plans_fts (uid, title, body)
	VALUES (NEW.uid, NEW.title, '');
END;
CREATE TRIGGER plans_fts_au
AFTER UPDATE ON plans
BEGIN
	UPDATE plans_fts
	SET title = NEW.title
	WHERE uid = OLD.uid;
END;
CREATE TRIGGER plans_fts_ad
AFTER DELETE ON plans
BEGIN
	DELETE FROM plans_fts WHERE uid = OLD.uid;
END;
CREATE TRIGGER slices_fts_ai
AFTER INSERT ON slices
BEGIN
	INSERT INTO slices_fts (uid, title, body)
	VALUES (NEW.uid, NEW.title, '');
END;
CREATE TRIGGER slices_fts_au
AFTER UPDATE ON slices
BEGIN
	UPDATE slices_fts
	SET title = NEW.title
	WHERE uid = OLD.uid;
END;
CREATE TRIGGER slices_fts_ad
AFTER DELETE ON slices
BEGIN
	DELETE FROM slices_fts WHERE uid = OLD.uid;
END;
CREATE TRIGGER coordination_journal_no_update
BEFORE UPDATE ON coordination_journal
BEGIN
	SELECT RAISE(ABORT, 'coordination_journal is append-only');
END;
CREATE TRIGGER coordination_journal_no_delete
BEFORE DELETE ON coordination_journal
BEGIN
	SELECT RAISE(ABORT, 'coordination_journal is append-only');
END;
CREATE TRIGGER proposals_revision_steps_by_one
BEFORE UPDATE OF revision ON proposals
FOR EACH ROW WHEN NEW.revision <> OLD.revision + 1
BEGIN
	SELECT RAISE(
		ABORT,
		'proposals.revision must advance by exactly one'
	);
END;
CREATE TRIGGER plans_revision_steps_by_one
BEFORE UPDATE OF revision ON plans
FOR EACH ROW WHEN NEW.revision <> OLD.revision + 1
BEGIN
	SELECT RAISE(
		ABORT,
		'plans.revision must advance by exactly one'
	);
END;
CREATE TRIGGER slices_revision_steps_by_one
BEFORE UPDATE OF revision ON slices
FOR EACH ROW WHEN NEW.revision <> OLD.revision + 1
BEGIN
	SELECT RAISE(
		ABORT,
		'slices.revision must advance by exactly one'
	);
END;

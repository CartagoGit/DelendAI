/**
 * 0016_work_units_generations.sql — multi-agent work model, part 2 of 3.
 *
 * The WORK half: a `work_unit` is one (repository, proposal, slice)
 * run; a `generation` is one checkpoint of that run. Together with
 * `work_unit_owners` and `claims` these four tables carry the whole
 * provenance chain the work model has to be able to answer:
 *
 *   proposal → slice → work unit → generation → agent → machine
 *            → file scope → base SHA → WIP SHA → PR → CI → integrated SHA
 *
 * WHY `proposal_uid` / `slice_uid` are TEXT and NOT foreign keys into
 * `proposals` / `slices`: those two tables are projections of the
 * markdown tree and are rebuilt by the reconciler; the work model is
 * rebuilt from the FORGE. A fresh machine must be able to reconstruct
 * a work unit from a discovered `wip/*` ref before the markdown
 * reconcile has run, and the two rebuilds must not be ordered against
 * each other. The uid is a stable natural key in both directions, so
 * the join is still exact — it just is not enforced by SQLite.
 *
 * WHY `UNIQUE (work_unit_id, generation)`: the spec's identity for a
 * checkpoint is `(repository, proposal, slice, generation)`, and
 * `work_units` is already UNIQUE on `(repository_id, proposal_uid,
 * slice_uid)`. So this one index IS that four-part identity, and
 * re-observing the same checkpoint after a crash is an upsert on a
 * key the forge itself can regenerate.
 *
 * WHY ownership lives in its own table: `work_units.current_owner_agent_id`
 * answers "who holds it now" in one read, but "who created it" and
 * "who held it before" must survive an unbounded number of handoffs.
 * `work_unit_owners` is that history, ordered by `seq`, where `seq = 0`
 * is ALWAYS the creator. `created_by_agent_id` is therefore recoverable
 * two ways, and a disagreement between them is a detectable anomaly.
 *
 * WHY `idx_claims_active_path` is a PARTIAL unique index: it is the
 * mutual exclusion of the shared checkout, enforced by SQLite rather
 * than by a convention. Two agents cannot hold the same path of the
 * same repository at once, and a claim is released by SETTING
 * `released_at`, never by deleting the row — so the history of who
 * touched a path is intact after the fact.
 */

CREATE TABLE IF NOT EXISTS work_units (
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
	current_owner_agent_id TEXT REFERENCES agents(id) ON DELETE RESTRICT,
	created_by_agent_id TEXT NOT NULL REFERENCES agents(id) ON DELETE RESTRICT,
	revision INTEGER NOT NULL DEFAULT 0 CHECK (revision >= 0),
	created_at INTEGER NOT NULL,
	updated_at INTEGER NOT NULL,
	closed_at INTEGER,
	UNIQUE (repository_id, proposal_uid, slice_uid)
);

CREATE INDEX IF NOT EXISTS idx_work_units_state ON work_units(state);
CREATE INDEX IF NOT EXISTS idx_work_units_owner
	ON work_units(current_owner_agent_id);
CREATE INDEX IF NOT EXISTS idx_work_units_slice
	ON work_units(proposal_uid, slice_uid);

CREATE TABLE IF NOT EXISTS work_unit_owners (
	id INTEGER PRIMARY KEY AUTOINCREMENT,
	work_unit_id INTEGER NOT NULL REFERENCES work_units(id) ON DELETE RESTRICT,
	seq INTEGER NOT NULL CHECK (seq >= 0),
	agent_id TEXT NOT NULL REFERENCES agents(id) ON DELETE RESTRICT,
	reason TEXT NOT NULL CHECK (
		reason IN ('created', 'claimed', 'recovered', 'handoff', 'released', 'expired')
	),
	acquired_at INTEGER NOT NULL,
	released_at INTEGER,
	UNIQUE (work_unit_id, seq)
);

CREATE INDEX IF NOT EXISTS idx_work_unit_owners_agent
	ON work_unit_owners(agent_id);

CREATE TABLE IF NOT EXISTS generations (
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
	author_agent_id TEXT NOT NULL REFERENCES agents(id) ON DELETE RESTRICT,
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
);

CREATE INDEX IF NOT EXISTS idx_generations_wip_head
	ON generations(wip_head_sha);
CREATE INDEX IF NOT EXISTS idx_generations_candidate_state
	ON generations(candidate_state);
CREATE INDEX IF NOT EXISTS idx_generations_pull_request
	ON generations(pull_request_id);

CREATE TABLE IF NOT EXISTS claims (
	id INTEGER PRIMARY KEY AUTOINCREMENT,
	repository_id INTEGER NOT NULL REFERENCES repositories(id) ON DELETE RESTRICT,
	path TEXT NOT NULL,
	owner_agent_id TEXT NOT NULL REFERENCES agents(id) ON DELETE RESTRICT,
	lease_id TEXT NOT NULL REFERENCES leases(id) ON DELETE RESTRICT,
	work_unit_id INTEGER NOT NULL REFERENCES work_units(id) ON DELETE RESTRICT,
	generation INTEGER CHECK (generation IS NULL OR generation >= 1),
	claimed_at INTEGER NOT NULL,
	released_at INTEGER
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_claims_active_path
	ON claims(repository_id, path) WHERE released_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_claims_work_unit ON claims(work_unit_id);
CREATE INDEX IF NOT EXISTS idx_claims_lease ON claims(lease_id);

CREATE TABLE IF NOT EXISTS work_reconciliation_runs (
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
);

CREATE INDEX IF NOT EXISTS idx_work_reconciliation_runs_machine
	ON work_reconciliation_runs(machine_id, started_at);

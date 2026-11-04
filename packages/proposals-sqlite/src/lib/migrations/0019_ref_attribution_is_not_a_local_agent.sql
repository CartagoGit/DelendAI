-- 0019 — attribution read from a ref is not a local agent row (x00550 S1).
--
-- `work_units`, `work_unit_owners` and `generations` record WHO did a
-- piece of work, and that value is parsed out of the work ref: the agent
-- component of `refs/wip/<agent>/<proposal>-<slice>-g<n>-<topic>`. 0016
-- required it to exist in `agents`, which is only true for work this
-- machine did itself. A ref written by another machine, by another host,
-- or by this machine before it registered an agent carries an id no local
-- table has, and the rebuild writes exactly what the ref said — the right
-- value, and a foreign key violation.
--
-- The violation was silent (the startup connection had `foreign_keys`
-- OFF; S2 turns it on) and surfaced days later as "the state database is
-- corrupt", blocking every mutation over rows delendai itself wrote:
--
--   foreign key violation in generations (row 1) referencing agents
--   foreign key violation in work_units (row 1) referencing agents
--   foreign key violation in work_unit_owners (row 1) referencing agents
--
-- So the attribution columns keep their value and lose the reference:
-- `NOT NULL` still holds (an unattributed unit is a bug), and
-- `agents` is still the registry of agents this machine knows.
--
-- What does NOT change: `claims.owner_agent_id` and `leases.owner_agent_id`
-- are local facts — this machine claiming files, this machine holding a
-- lease — and they keep their foreign key, so an unregistered agent still
-- cannot claim or lease anything.
--
-- The tables are recreated because SQLite cannot drop a foreign key in
-- place, under the procedure SQLite documents for it (the marker below
-- makes the runner disable foreign keys around this migration's
-- transaction and verify `foreign_key_check` before it commits).
--
-- delendai:rebuilds-tables
--
-- Every column, CHECK, UNIQUE and index is reproduced from 0016,
-- and the rows are copied before the old tables are dropped.

CREATE TABLE work_units_0019 (
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
);

INSERT INTO work_units_0019 (
	id, uid, repository_id, proposal_uid, slice_uid, state,
	current_generation, current_owner_agent_id, created_by_agent_id,
	revision, created_at, updated_at, closed_at
)
SELECT
	id, uid, repository_id, proposal_uid, slice_uid, state,
	current_generation, current_owner_agent_id, created_by_agent_id,
	revision, created_at, updated_at, closed_at
FROM work_units;

CREATE TABLE work_unit_owners_0019 (
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
);

INSERT INTO work_unit_owners_0019 (
	id, work_unit_id, seq, agent_id, reason, acquired_at, released_at
)
SELECT id, work_unit_id, seq, agent_id, reason, acquired_at, released_at
FROM work_unit_owners;

CREATE TABLE generations_0019 (
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
);

INSERT INTO generations_0019 (
	id, work_unit_id, generation, base_integration_sha, wip_ref, wip_head_sha,
	patch_digest, file_scope_json, file_scope_digest, checkpoint_kind,
	candidate_state, validation_state, author_agent_id, machine_id,
	pull_request_id, ci_result, integrated_sha, revision, created_at, updated_at
)
SELECT
	id, work_unit_id, generation, base_integration_sha, wip_ref, wip_head_sha,
	patch_digest, file_scope_json, file_scope_digest, checkpoint_kind,
	candidate_state, validation_state, author_agent_id, machine_id,
	pull_request_id, ci_result, integrated_sha, revision, created_at, updated_at
FROM generations;

DROP TABLE generations;
DROP TABLE work_unit_owners;
DROP TABLE work_units;

ALTER TABLE work_units_0019 RENAME TO work_units;
ALTER TABLE work_unit_owners_0019 RENAME TO work_unit_owners;
ALTER TABLE generations_0019 RENAME TO generations;

CREATE INDEX IF NOT EXISTS idx_work_units_state ON work_units(state);
CREATE INDEX IF NOT EXISTS idx_work_units_owner
	ON work_units(current_owner_agent_id);
CREATE INDEX IF NOT EXISTS idx_work_units_slice
	ON work_units(proposal_uid, slice_uid);
CREATE INDEX IF NOT EXISTS idx_work_unit_owners_agent
	ON work_unit_owners(agent_id);
CREATE INDEX IF NOT EXISTS idx_generations_wip_head
	ON generations(wip_head_sha);
CREATE INDEX IF NOT EXISTS idx_generations_candidate_state
	ON generations(candidate_state);
CREATE INDEX IF NOT EXISTS idx_generations_pull_request
	ON generations(pull_request_id);

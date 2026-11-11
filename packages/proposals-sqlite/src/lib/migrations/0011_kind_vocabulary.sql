/**
 * 0011_kind_vocabulary.sql — x00539 S1.
 *
 * Widens the `proposals.kind` CHECK enum to the canonical vocabulary
 * owned by `src/lib/vocabulary.ts`, which is the proposals plugin's
 * `IProposalKind` verbatim. Two values were missing:
 *
 *   - `infra` (prefix `i`): three files on disk already carry it
 *     (i00002, i00003, i00004). It is a first-class family in the
 *     authoring ontology — own prefix, own `done/infras/` folder, own
 *     slot in the cascade order — so it is ADDED, not mapped onto
 *     `chore`. See the decision note in `vocabulary.ts`.
 *   - `repair` (prefix `e`): first-class in the same ontology; no file
 *     uses it yet, and the first one that does must not reproduce the
 *     `CHECK constraint failed` that killed the whole run.
 *
 * SQLite cannot ALTER a CHECK constraint, so `proposals` is rebuilt.
 * `plans` and `slices` are rebuilt with it — not because their shape
 * changes, but because `ALTER TABLE … RENAME` rewrites the REFERENCES
 * clauses of child tables while `PRAGMA foreign_keys` is ON, and the
 * migration engine runs each file inside a transaction where that
 * pragma is a no-op. Renaming all three away first and recreating them
 * top-down keeps every foreign key pointing at the right table and
 * lets each `_x00539_old_*` table be dropped while nothing references
 * its rows (which `ON DELETE RESTRICT` would otherwise refuse).
 *
 * Rows keep their `id`, so `plans.proposal_id` and `slices.plan_id`
 * stay valid. The FTS5 index is untouched: the copies run while the
 * `*_fts_*` triggers are attached to the renamed old tables, and the
 * triggers are recreated afterwards, so no row is re-indexed or lost.
 */

ALTER TABLE slices RENAME TO _x00539_old_slices;
ALTER TABLE plans RENAME TO _x00539_old_plans;
ALTER TABLE proposals RENAME TO _x00539_old_proposals;

CREATE TABLE proposals (
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
);

CREATE TABLE plans (
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
);

CREATE TABLE slices (
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
);

INSERT INTO proposals (
	id, uid, slug, kind, status, title, source_path, source_blob_sha,
	revision, content_hash, created_at, updated_at, closed_at,
	deleted_at, last_seen_at, last_seen_commit, tombstone_reason
)
SELECT
	id, uid, slug, kind, status, title, source_path, source_blob_sha,
	revision, content_hash, created_at, updated_at, closed_at,
	deleted_at, last_seen_at, last_seen_commit, tombstone_reason
FROM _x00539_old_proposals;

INSERT INTO plans (
	id, uid, proposal_id, slug, title, source_path, revision,
	created_at, updated_at, closed_at, deleted_at, last_seen_at,
	last_seen_commit, tombstone_reason, status
)
SELECT
	id, uid, proposal_id, slug, title, source_path, revision,
	created_at, updated_at, closed_at, deleted_at, last_seen_at,
	last_seen_commit, tombstone_reason, status
FROM _x00539_old_plans;

INSERT INTO slices (
	id, uid, plan_id, slug, title, source_path, revision,
	created_at, updated_at, closed_at, deleted_at, last_seen_at,
	last_seen_commit, tombstone_reason, status
)
SELECT
	id, uid, plan_id, slug, title, source_path, revision,
	created_at, updated_at, closed_at, deleted_at, last_seen_at,
	last_seen_commit, tombstone_reason, status
FROM _x00539_old_slices;

DROP TABLE _x00539_old_slices;
DROP TABLE _x00539_old_plans;
DROP TABLE _x00539_old_proposals;

CREATE INDEX IF NOT EXISTS idx_proposals_status ON proposals(status);
CREATE INDEX IF NOT EXISTS idx_proposals_kind ON proposals(kind);
CREATE INDEX IF NOT EXISTS idx_plans_proposal_id ON plans(proposal_id);
CREATE INDEX IF NOT EXISTS idx_slices_plan_id ON slices(plan_id);

CREATE TRIGGER IF NOT EXISTS plans_closed_at_matches_status_insert
BEFORE INSERT ON plans
WHEN (
	(NEW.status IN ('done', 'retired', 'superseded', 'quarantined') AND NEW.closed_at IS NULL)
	OR
	(NEW.status NOT IN ('done', 'retired', 'superseded', 'quarantined') AND NEW.closed_at IS NOT NULL)
)
BEGIN
	SELECT RAISE(ABORT, 'plans.closed_at must match terminal status');
END;

CREATE TRIGGER IF NOT EXISTS plans_closed_at_matches_status_update
BEFORE UPDATE ON plans
WHEN (
	(NEW.status IN ('done', 'retired', 'superseded', 'quarantined') AND NEW.closed_at IS NULL)
	OR
	(NEW.status NOT IN ('done', 'retired', 'superseded', 'quarantined') AND NEW.closed_at IS NOT NULL)
)
BEGIN
	SELECT RAISE(ABORT, 'plans.closed_at must match terminal status');
END;

CREATE TRIGGER IF NOT EXISTS slices_closed_at_matches_status_insert
BEFORE INSERT ON slices
WHEN (
	(NEW.status IN ('done', 'retired', 'superseded', 'quarantined') AND NEW.closed_at IS NULL)
	OR
	(NEW.status NOT IN ('done', 'retired', 'superseded', 'quarantined') AND NEW.closed_at IS NOT NULL)
)
BEGIN
	SELECT RAISE(ABORT, 'slices.closed_at must match terminal status');
END;

CREATE TRIGGER IF NOT EXISTS slices_closed_at_matches_status_update
BEFORE UPDATE ON slices
WHEN (
	(NEW.status IN ('done', 'retired', 'superseded', 'quarantined') AND NEW.closed_at IS NULL)
	OR
	(NEW.status NOT IN ('done', 'retired', 'superseded', 'quarantined') AND NEW.closed_at IS NOT NULL)
)
BEGIN
	SELECT RAISE(ABORT, 'slices.closed_at must match terminal status');
END;

CREATE TRIGGER IF NOT EXISTS proposals_fts_ai
AFTER INSERT ON proposals
BEGIN
	INSERT INTO proposals_fts (uid, title, body)
	VALUES (NEW.uid, NEW.title, '');
END;

CREATE TRIGGER IF NOT EXISTS proposals_fts_au
AFTER UPDATE ON proposals
BEGIN
	UPDATE proposals_fts
	SET title = NEW.title
	WHERE uid = OLD.uid;
END;

CREATE TRIGGER IF NOT EXISTS proposals_fts_ad
AFTER DELETE ON proposals
BEGIN
	DELETE FROM proposals_fts WHERE uid = OLD.uid;
END;

CREATE TRIGGER IF NOT EXISTS plans_fts_ai
AFTER INSERT ON plans
BEGIN
	INSERT INTO plans_fts (uid, title, body)
	VALUES (NEW.uid, NEW.title, '');
END;

CREATE TRIGGER IF NOT EXISTS plans_fts_au
AFTER UPDATE ON plans
BEGIN
	UPDATE plans_fts
	SET title = NEW.title
	WHERE uid = OLD.uid;
END;

CREATE TRIGGER IF NOT EXISTS plans_fts_ad
AFTER DELETE ON plans
BEGIN
	DELETE FROM plans_fts WHERE uid = OLD.uid;
END;

CREATE TRIGGER IF NOT EXISTS slices_fts_ai
AFTER INSERT ON slices
BEGIN
	INSERT INTO slices_fts (uid, title, body)
	VALUES (NEW.uid, NEW.title, '');
END;

CREATE TRIGGER IF NOT EXISTS slices_fts_au
AFTER UPDATE ON slices
BEGIN
	UPDATE slices_fts
	SET title = NEW.title
	WHERE uid = OLD.uid;
END;

CREATE TRIGGER IF NOT EXISTS slices_fts_ad
AFTER DELETE ON slices
BEGIN
	DELETE FROM slices_fts WHERE uid = OLD.uid;
END;

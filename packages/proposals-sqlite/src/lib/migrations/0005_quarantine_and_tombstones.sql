/**
 * 0005_quarantine_and_tombstones.sql — q00022 S1 + f00515 + f00519.
 *
 * Two tables:
 *
 *   - `quarantine`: a parse / validation failure gets one row with
 *     the full forensic record (source path, blob sha, error code,
 *     raw metadata, the run id). The reconciler never silently drops
 *     a corrupt file; it quarantines it.
 *
 *   - `tombstones`: an entity that disappeared from Git gets one row
 *     with the reason (git-removed, renamed, moved-by-reorg,
 *     unknown) plus the last-seen commit. The audit's invariant on
 *     "no entity silently disappears" is satisfied.
 *
 * Plus columns on proposals, plans, slices for the tombstone-side:
 * `deleted_at`, `last_seen_at`, `last_seen_commit`,
 * `tombstone_reason`. SQLite ALTER TABLE ADD COLUMN is supported;
 * the migration is applied at startup via the migrations engine.
 */

CREATE TABLE IF NOT EXISTS quarantine (
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
);

CREATE INDEX IF NOT EXISTS idx_quarantine_status ON quarantine(status);

CREATE TABLE IF NOT EXISTS path_history (
	id INTEGER PRIMARY KEY AUTOINCREMENT,
	entity_type TEXT NOT NULL CHECK (
		entity_type IN ('proposal', 'plan', 'slice')
	),
	entity_uid TEXT NOT NULL,
	from_path TEXT NOT NULL,
	to_path TEXT NOT NULL,
	changed_at INTEGER NOT NULL,
	source_commit TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_path_history_entity
	ON path_history(entity_type, entity_uid);

CREATE TABLE IF NOT EXISTS tombstones (
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
);

CREATE INDEX IF NOT EXISTS idx_tombstones_entity
	ON tombstones(entity_type, entity_uid);

ALTER TABLE proposals ADD COLUMN deleted_at INTEGER;
ALTER TABLE proposals ADD COLUMN last_seen_at INTEGER;
ALTER TABLE proposals ADD COLUMN last_seen_commit TEXT;
ALTER TABLE proposals ADD COLUMN tombstone_reason TEXT;

ALTER TABLE plans ADD COLUMN deleted_at INTEGER;
ALTER TABLE plans ADD COLUMN last_seen_at INTEGER;
ALTER TABLE plans ADD COLUMN last_seen_commit TEXT;
ALTER TABLE plans ADD COLUMN tombstone_reason TEXT;

ALTER TABLE slices ADD COLUMN deleted_at INTEGER;
ALTER TABLE slices ADD COLUMN last_seen_at INTEGER;
ALTER TABLE slices ADD COLUMN last_seen_commit TEXT;
ALTER TABLE slices ADD COLUMN tombstone_reason TEXT;
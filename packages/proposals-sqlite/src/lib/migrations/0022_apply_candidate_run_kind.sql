-- 0022 — an apply run is recorded as `apply_candidate` (q00024 S3).
--
-- q00024 S3 names the row a transactional apply writes to
-- `reconciliation_runs` `kind = 'apply_candidate'`; the schema has
-- called it `promote` since 0002, so the audit query the proposal
-- describes found nothing. SQLite cannot change a CHECK in place, so the
-- table is rebuilt the way 0020 rebuilt it: a copy with the new
-- vocabulary, the rows copied with `promote` renamed, the old table
-- dropped, the copy renamed into its place, its indexes recreated and
-- its AUTOINCREMENT counter kept.
-- delendai:rebuilds-tables
CREATE TEMP TABLE apply_kind_sequences AS
	SELECT name, seq FROM sqlite_sequence
	WHERE name = 'reconciliation_runs';

CREATE TABLE "reconciliation_runs__v22" (
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
		kind IN ('incremental', 'shadow', 'apply_candidate', 'rebuild')
	),
	error TEXT
) STRICT;
INSERT INTO "reconciliation_runs__v22" ("id", "source_commit", "source_tree", "reconciler_version", "schema_version", "started_at", "completed_at", "status", "files_seen", "files_changed", "entities_created", "entities_updated", "entities_deleted", "entities_quarantined", "logical_digest", "kind", "error") SELECT "id", "source_commit", "source_tree", "reconciler_version", "schema_version", "started_at", "completed_at", "status", "files_seen", "files_changed", "entities_created", "entities_updated", "entities_deleted", "entities_quarantined", "logical_digest", CASE "kind" WHEN 'promote' THEN 'apply_candidate' ELSE "kind" END, "error" FROM "reconciliation_runs";
DROP TABLE "reconciliation_runs";
ALTER TABLE "reconciliation_runs__v22" RENAME TO "reconciliation_runs";

CREATE INDEX idx_runs_source_commit ON reconciliation_runs(source_commit);
CREATE INDEX idx_runs_status ON reconciliation_runs(status);

UPDATE sqlite_sequence
	SET seq = (SELECT saved.seq FROM apply_kind_sequences AS saved)
	WHERE name = 'reconciliation_runs'
		AND seq < (SELECT saved.seq FROM apply_kind_sequences AS saved);
INSERT INTO sqlite_sequence (name, seq)
	SELECT name, seq FROM apply_kind_sequences
	WHERE name NOT IN (SELECT name FROM sqlite_sequence);
DROP TABLE apply_kind_sequences;

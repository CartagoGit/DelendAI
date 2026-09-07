/**
 * 0002_reconciliation_runs.sql — q00022 S1.
 *
 * Adds `reconciliation_runs`, the audit trail that answers "what did
 * the last reconcile do?". Every reconcile (incremental or shadow)
 * and every promote writes exactly one row with the counters, the
 * source commit, the logical digest, and the run status. The audit's
 * P0 acceptance invariant (q00022 S5 / a00094) uses this table.
 */

CREATE TABLE IF NOT EXISTS reconciliation_runs (
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
);

CREATE INDEX IF NOT EXISTS idx_runs_source_commit ON reconciliation_runs(source_commit);
CREATE INDEX IF NOT EXISTS idx_runs_status ON reconciliation_runs(status);
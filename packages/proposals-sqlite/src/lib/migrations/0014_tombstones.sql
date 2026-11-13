/**
 * 0014_tombstones.sql — f00519 S1.
 *
 * `path_history` and `tombstones` already exist since 0005, so this
 * migration does NOT duplicate that DDL. It adds the indexes the S1
 * reconciler path needs for idempotent carry-forward and append-only
 * history writes on repeated shadow runs.
 */

CREATE UNIQUE INDEX IF NOT EXISTS idx_path_history_transition
	ON path_history(entity_type, entity_uid, from_path, to_path, source_commit);

CREATE INDEX IF NOT EXISTS idx_path_history_changed_at
	ON path_history(changed_at, entity_type, entity_uid);

CREATE UNIQUE INDEX IF NOT EXISTS idx_tombstones_observation
	ON tombstones(entity_type, entity_uid, deleted_at, last_seen_commit);

CREATE INDEX IF NOT EXISTS idx_tombstones_deleted_at
	ON tombstones(deleted_at, entity_type, entity_uid);
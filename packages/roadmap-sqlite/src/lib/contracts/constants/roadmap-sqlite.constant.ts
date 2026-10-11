/** The schema version a fresh database is created at. */
export const ROADMAP_SQLITE_SCHEMA_VERSION = 2;

/** The oldest schema version this driver can bring forward. */
export const ROADMAP_SQLITE_OLDEST_MIGRATABLE_VERSION = 1;

/** File name of the timeline database inside the plugin cache directory. */
export const ROADMAP_TIMELINE_DB_FILENAME = 'roadmap-timeline.sqlite';

export const SQLITE_BOOT_PRAGMAS = [
	'PRAGMA journal_mode = WAL;',
	'PRAGMA synchronous = NORMAL;',
	'PRAGMA busy_timeout = 5000;',
] as const;

/** The only table: one row per event, in the order they were appended. */
export const CREATE_EVENTS_TABLE_SQL = `
CREATE TABLE IF NOT EXISTS timeline_events (
	seq INTEGER PRIMARY KEY,
	at TEXT NOT NULL,
	actor TEXT NOT NULL,
	kind TEXT NOT NULL,
	horizon TEXT NOT NULL,
	entry_id TEXT,
	reason TEXT NOT NULL,
	event_json TEXT NOT NULL
);
`;

export const CREATE_EVENTS_INDEXES_SQL = [
	'CREATE INDEX IF NOT EXISTS idx_timeline_events_entry ON timeline_events(entry_id);',
	'CREATE INDEX IF NOT EXISTS idx_timeline_events_horizon ON timeline_events(horizon);',
] as const;

/**
 * The history is append-only in the database itself, not only in the
 * driver: a stray `UPDATE` or `DELETE` from any other tool is refused.
 */
export const APPEND_ONLY_GUARD_SQL = [
	`CREATE TRIGGER IF NOT EXISTS timeline_events_no_update
BEFORE UPDATE ON timeline_events
BEGIN SELECT RAISE(ABORT, 'timeline events are append-only'); END;`,
	`CREATE TRIGGER IF NOT EXISTS timeline_events_no_delete
BEFORE DELETE ON timeline_events
BEGIN SELECT RAISE(ABORT, 'timeline events are append-only'); END;`,
] as const;

/** The table as version 1 shipped it: the event as JSON and nothing to filter on. */
export const CREATE_EVENTS_TABLE_V1_SQL = `
CREATE TABLE IF NOT EXISTS timeline_events (
	seq INTEGER PRIMARY KEY,
	at TEXT NOT NULL,
	actor TEXT NOT NULL,
	kind TEXT NOT NULL,
	reason TEXT NOT NULL,
	event_json TEXT NOT NULL
);
`;

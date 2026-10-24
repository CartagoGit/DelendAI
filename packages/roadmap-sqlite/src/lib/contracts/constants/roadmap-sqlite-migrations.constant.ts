import type { IRoadmapSqliteMigration } from '../interfaces/roadmap-sqlite.interface';
import {
	APPEND_ONLY_GUARD_SQL,
	CREATE_EVENTS_INDEXES_SQL,
} from './roadmap-sqlite.constant';

/**
 * Ordered steps up to `ROADMAP_SQLITE_SCHEMA_VERSION`. A row the step
 * cannot carry aborts the whole migration, and the database stays at the
 * version it had.
 */
export const ROADMAP_SQLITE_MIGRATIONS: readonly IRoadmapSqliteMigration[] = [
	{
		// v1 -> v2: horizon and entry id become columns, so a question about
		// one entry reads an index instead of every event's JSON. Version 1
		// had no guards, so the backfill runs before they are created.
		from: 1,
		statements: [
			'ALTER TABLE timeline_events ADD COLUMN horizon TEXT;',
			'ALTER TABLE timeline_events ADD COLUMN entry_id TEXT;',
			`UPDATE timeline_events
SET horizon = json_extract(event_json, '$.horizon'),
	entry_id = json_extract(event_json, '$.entryId');`,
			...CREATE_EVENTS_INDEXES_SQL,
			...APPEND_ONLY_GUARD_SQL,
		],
	},
];

import type { Database } from 'bun:sqlite';

import {
	APPEND_ONLY_GUARD_SQL,
	CREATE_EVENTS_INDEXES_SQL,
	CREATE_EVENTS_TABLE_SQL,
	ROADMAP_SQLITE_OLDEST_MIGRATABLE_VERSION,
	ROADMAP_SQLITE_SCHEMA_VERSION,
} from './contracts/constants/roadmap-sqlite.constant';
import { ROADMAP_SQLITE_MIGRATIONS } from './contracts/constants/roadmap-sqlite-migrations.constant';

export const readUserVersion = (db: Database): number => {
	const row = db.query('PRAGMA user_version;').get() as Record<
		string,
		number
	> | null;
	return row?.user_version ?? 0;
};

/**
 * Brings the database to the current schema. Safe to run on every open: a
 * database already at the current version is left alone, an older one is
 * migrated step by step, and a newer one is refused, because writing to a
 * schema this driver does not know could corrupt it.
 */
export const migrateRoadmapDatabase = (db: Database): void => {
	const version = readUserVersion(db);
	if (version > ROADMAP_SQLITE_SCHEMA_VERSION) {
		throw new Error(
			`roadmap timeline database is at schema ${version}, newer than the ${ROADMAP_SQLITE_SCHEMA_VERSION} this delendai understands; upgrade delendai`,
		);
	}
	if (version === ROADMAP_SQLITE_SCHEMA_VERSION) return;
	if (version === 0) {
		db.transaction(() => {
			db.run(CREATE_EVENTS_TABLE_SQL);
			for (const statement of CREATE_EVENTS_INDEXES_SQL)
				db.run(statement);
			for (const statement of APPEND_ONLY_GUARD_SQL) db.run(statement);
			db.run(`PRAGMA user_version = ${ROADMAP_SQLITE_SCHEMA_VERSION};`);
		}).immediate();
		return;
	}
	if (version < ROADMAP_SQLITE_OLDEST_MIGRATABLE_VERSION) {
		throw new Error(
			`roadmap timeline database is at schema ${version}, older than the ${ROADMAP_SQLITE_OLDEST_MIGRATABLE_VERSION} that can be migrated`,
		);
	}
	const steps = ROADMAP_SQLITE_MIGRATIONS.filter(
		(step) => step.from >= version,
	);
	db.transaction(() => {
		for (const step of steps) {
			for (const statement of step.statements) db.run(statement);
		}
		db.run(`PRAGMA user_version = ${ROADMAP_SQLITE_SCHEMA_VERSION};`);
	}).immediate();
};

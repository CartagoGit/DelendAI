/**
 * strict-tables.spec.ts — q00022 S1: every proposals table is STRICT.
 *
 * A column declared INTEGER in a table that is not STRICT stores the text
 * 'abc' without complaint. 0020 rebuilds every table STRICT; these pin
 * that a fresh database is, that an existing one keeps its rows, triggers
 * and indexes through the rebuild, and that a wrong-typed value is now
 * refused at the write.
 */
import { Database } from 'bun:sqlite';
import { describe, expect, it } from 'bun:test';

import {
	MIGRATION_CHECKSUMS,
	MIGRATION_FILES,
	applyMigrations,
	assertStrictTablesSupported,
	readMigrationSource,
} from '../../../src/lib/migrations';

interface ITableRow {
	readonly name: string;
	readonly type: string;
	readonly strict: number;
}

/** Tables that are not STRICT, virtual FTS tables and their shadows aside. */
const nonStrictTables = (db: Database): readonly string[] =>
	(db.query('PRAGMA table_list').all() as ITableRow[])
		.filter(
			(table) =>
				table.type === 'table' &&
				table.strict === 0 &&
				!table.name.startsWith('sqlite_'),
		)
		.map((table) => table.name);

const schemaObjects = (db: Database, type: string): readonly string[] =>
	(
		db
			.query(
				`SELECT name FROM sqlite_master WHERE type = '${type}' AND sql IS NOT NULL ORDER BY name`,
			)
			.all() as { name: string }[]
	).map((row) => row.name);

/** A database at schema version 19, built the way it was before 0020. */
/** A database built by the migrations before `version`, as it was then. */
const atVersion = (version: number): Database => {
	const db = new Database(':memory:');
	db.exec(`CREATE TABLE schema_migrations (
		version INTEGER PRIMARY KEY, name TEXT NOT NULL,
		checksum TEXT NOT NULL, applied_at INTEGER NOT NULL);`);
	for (const name of MIGRATION_FILES) {
		const at = Number.parseInt(name.slice(0, 4), 10);
		if (at >= version) continue;
		db.exec('PRAGMA foreign_keys = OFF;');
		db.exec(readMigrationSource(name));
		db.exec('PRAGMA foreign_keys = ON;');
		db.prepare(
			'INSERT INTO schema_migrations (version, name, checksum, applied_at) VALUES (?, ?, ?, ?)',
		).run(
			at,
			name,
			MIGRATION_CHECKSUMS[name] ?? '',
			1_700_000_000_000 + at,
		);
	}
	return db;
};

const insertRun = (db: Database, id: number, schemaVersion: unknown): void => {
	db.prepare(
		"INSERT INTO reconciliation_runs (id, reconciler_version, schema_version, started_at, status) VALUES (?, 'v1', ?, 1, 'ok')",
	).run(id, schemaVersion as number);
};

const atVersion19 = (): Database => {
	const db = new Database(':memory:');
	db.exec(`CREATE TABLE schema_migrations (
		version INTEGER PRIMARY KEY, name TEXT NOT NULL,
		checksum TEXT NOT NULL, applied_at INTEGER NOT NULL);`);
	for (const name of MIGRATION_FILES) {
		const version = Number.parseInt(name.slice(0, 4), 10);
		if (version >= 20) continue;
		db.exec('PRAGMA foreign_keys = OFF;');
		db.exec(readMigrationSource(name));
		db.exec('PRAGMA foreign_keys = ON;');
		db.prepare(
			'INSERT INTO schema_migrations (version, name, checksum, applied_at) VALUES (?, ?, ?, ?)',
		).run(
			version,
			name,
			MIGRATION_CHECKSUMS[name] ?? '',
			1_700_000_000_000 + version,
		);
	}
	return db;
};

describe('every proposals table is STRICT (q00022 S1)', () => {
	it('builds a fresh database entirely of STRICT tables', () => {
		const db = new Database(':memory:');
		applyMigrations(db);
		expect(nonStrictTables(db)).toEqual([]);
	});

	it('rebuilds an existing database STRICT and keeps its rows, triggers and indexes', () => {
		const db = atVersion19();
		expect(nonStrictTables(db).length).toBeGreaterThan(20);
		const triggers = schemaObjects(db, 'trigger');
		const indexes = schemaObjects(db, 'index');
		const applied = db
			.query(
				'SELECT version, applied_at FROM schema_migrations ORDER BY version',
			)
			.all();

		const outcome = applyMigrations(db);

		expect(outcome.applied.map((migration) => migration.name)).toEqual([
			'0020_strict_tables.sql',
		]);
		expect(nonStrictTables(db)).toEqual([]);
		expect(schemaObjects(db, 'trigger')).toEqual(triggers);
		expect(schemaObjects(db, 'index')).toEqual(indexes);
		expect(
			db
				.query(
					'SELECT version, applied_at FROM schema_migrations WHERE version < 20 ORDER BY version',
				)
				.all(),
		).toEqual(applied);
		expect(db.query('PRAGMA foreign_key_check').all()).toEqual([]);
	});

	it('refuses a value of the wrong type at the write', () => {
		const db = new Database(':memory:');
		applyMigrations(db);
		expect(() =>
			db.exec(
				"INSERT INTO schema_migrations (version, name, checksum, applied_at) VALUES (99, 'x', 'y', 'not-a-time')",
			),
		).toThrow(/cannot store TEXT value in INTEGER column/u);
	});

	it('refuses a SQLite that has no STRICT tables', () => {
		expect(() => assertStrictTablesSupported('3.36.0')).toThrow(
			/has no STRICT tables/u,
		);
		expect(() => assertStrictTablesSupported('3.37.0')).not.toThrow();
		expect(() => assertStrictTablesSupported('3.53.2')).not.toThrow();
		expect(() => assertStrictTablesSupported('4.0.0')).not.toThrow();
	});

	it('keeps AUTOINCREMENT counters across the rebuild', () => {
		const db = atVersion(20);
		insertRun(db, 41, 19);
		db.exec('DELETE FROM reconciliation_runs WHERE id = 41');
		applyMigrations(db);
		// AUTOINCREMENT never reuses an id, even one whose row is gone.
		db.exec(
			"INSERT INTO reconciliation_runs (reconciler_version, schema_version, started_at, status) VALUES ('v1', 20, 2, 'ok')",
		);
		expect(
			(
				db
					.query('SELECT MAX(id) AS id FROM reconciliation_runs')
					.get() as { id: number }
			).id,
		).toBe(42);
	});

	it('rolls the whole upgrade back when a stored value is not its column type', () => {
		const db = atVersion(20);
		insertRun(db, 1, 'not-a-version');
		const before = nonStrictTables(db).length;
		expect(() => applyMigrations(db)).toThrow(
			/cannot store TEXT value in INTEGER column/u,
		);
		// Nothing half-applied: every table is still the old one, the row
		// is still there, and 0020 is not recorded.
		expect(nonStrictTables(db).length).toBe(before);
		expect(
			db
				.query(
					'SELECT schema_version FROM reconciliation_runs WHERE id = 1',
				)
				.get(),
		).toEqual({ schema_version: 'not-a-version' });
		expect(
			db
				.query(
					'SELECT COUNT(*) AS n FROM schema_migrations WHERE version = 20',
				)
				.get(),
		).toEqual({ n: 0 });
	});

	it('upgrades from older schema versions as well as from 19', () => {
		for (const version of [6, 12, 16]) {
			const db = atVersion(version);
			const outcome = applyMigrations(db);
			expect(outcome.applied.at(-1)?.name).toBe('0020_strict_tables.sql');
			expect(nonStrictTables(db)).toEqual([]);
			expect(db.query('PRAGMA foreign_key_check').all()).toEqual([]);
		}
	});
});

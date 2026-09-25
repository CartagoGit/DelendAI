/**
 * apply-candidate-run-kind.spec.ts — q00024 S3: an apply run is recorded
 * as `apply_candidate`, and a database that recorded `promote` is carried
 * over without losing a row, an index or its run counter.
 */
import { Database } from 'bun:sqlite';
import { describe, expect, it } from 'bun:test';

import {
	MIGRATION_CHECKSUMS,
	MIGRATION_FILES,
	applyMigrations,
	readMigrationSource,
} from '../../../src/lib/migrations';

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

const run = (db: Database, id: number, kind: string): void => {
	db.prepare(
		"INSERT INTO reconciliation_runs (id, reconciler_version, schema_version, started_at, status, kind) VALUES (?, 'v', 21, 1, 'ok', ?)",
	).run(id, kind);
};

describe('apply runs are apply_candidate', () => {
	it('renames the promote rows, keeps the rest, the indexes and the counter', () => {
		const db = atVersion(22);
		run(db, 1, 'shadow');
		run(db, 2, 'promote');
		run(db, 7, 'incremental');
		db.prepare('DELETE FROM reconciliation_runs WHERE id = 7').run();

		applyMigrations(db);

		expect(
			db
				.query('SELECT id, kind FROM reconciliation_runs ORDER BY id')
				.all(),
		).toEqual([
			{ id: 1, kind: 'shadow' },
			{ id: 2, kind: 'apply_candidate' },
		]);
		expect(
			db
				.query(
					"SELECT name FROM sqlite_master WHERE type = 'index' AND tbl_name = 'reconciliation_runs' ORDER BY name",
				)
				.all(),
		).toEqual([
			{ name: 'idx_runs_source_commit' },
			{ name: 'idx_runs_status' },
		]);
		// A deleted run's id is never handed out again.
		db.prepare(
			"INSERT INTO reconciliation_runs (reconciler_version, schema_version, started_at, status) VALUES ('v', 22, 1, 'ok')",
		).run();
		expect(
			db.query('SELECT max(id) AS id FROM reconciliation_runs').get(),
		).toEqual({ id: 8 });
		expect(db.query('PRAGMA foreign_key_check').all()).toEqual([]);
	});

	it('refuses the old kind once migrated', () => {
		const db = new Database(':memory:');
		applyMigrations(db);
		expect(() => run(db, 1, 'promote')).toThrow();
		expect(() => run(db, 2, 'apply_candidate')).not.toThrow();
	});
});

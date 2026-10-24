/**
 * sqlite-schema.ts — a REAL SQLite state database for the specs.
 *
 * The production work model lives in `@delendai/proposals-sqlite`, whose
 * driver is a `bun:sqlite` builtin and cannot be resolved under vitest.
 * Mocking it would defeat the point: the claims under test are that
 * re-observing the same ref produces ONE row, that a merge cannot be
 * recorded against a durability checkpoint, and that a second live owner
 * of a path is impossible. Those are constraints of the SCHEMA, so the
 * specs bind the reconciler's ports to a real `node:sqlite` database
 * carrying the same keys, the same partial index and the same CHECKs as
 * migrations 0015-0017.
 *
 * The migration list is deliberately versioned and incomplete-able: a
 * spec can open a database at an older version and watch startup bring it
 * forward, which is the only way to prove "no manual `run migrate`".
 */

import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

/** One migration, exactly as the production engine models them. */
export interface ITestMigration {
	readonly version: number;
	readonly name: string;
	readonly sql: string;
	/**
	 * True when the migration's effect on existing rows is not determined
	 * — the reconciler must report it instead of applying it.
	 */
	readonly ambiguous?: boolean;
}

export const TEST_MIGRATIONS: readonly ITestMigration[] = [
	{
		version: 1,
		name: '0001_identity.sql',
		sql: `
			CREATE TABLE repositories (
				id INTEGER PRIMARY KEY AUTOINCREMENT,
				forge TEXT NOT NULL,
				owner TEXT NOT NULL,
				name TEXT NOT NULL,
				integration_branch TEXT NOT NULL,
				release_branch TEXT NOT NULL,
				UNIQUE (forge, owner, name)
			);
			CREATE TABLE machines (
				machine_id TEXT PRIMARY KEY,
				hostname TEXT NOT NULL,
				platform TEXT,
				first_seen INTEGER NOT NULL,
				last_seen INTEGER NOT NULL
			);
			CREATE TABLE agents (
				id TEXT PRIMARY KEY,
				host TEXT NOT NULL,
				machine_id TEXT NOT NULL,
				first_seen INTEGER NOT NULL,
				last_seen INTEGER NOT NULL
			);
			CREATE TABLE leases (
				id TEXT PRIMARY KEY,
				owner_agent_id TEXT NOT NULL,
				machine_id TEXT NOT NULL,
				acquired_at INTEGER NOT NULL,
				heartbeat_at INTEGER NOT NULL,
				expires_at INTEGER NOT NULL,
				released_at INTEGER
			);
		`,
	},
	{
		version: 2,
		name: '0002_work_units_generations.sql',
		sql: `
			CREATE TABLE work_units (
				id INTEGER PRIMARY KEY AUTOINCREMENT,
				uid TEXT NOT NULL UNIQUE,
				repository_id INTEGER NOT NULL,
				proposal_uid TEXT NOT NULL,
				slice_uid TEXT NOT NULL,
				state TEXT NOT NULL,
				current_generation INTEGER NOT NULL DEFAULT 0,
				current_owner_agent_id TEXT,
				created_by_agent_id TEXT NOT NULL,
				created_at INTEGER NOT NULL,
				updated_at INTEGER NOT NULL,
				UNIQUE (repository_id, proposal_uid, slice_uid)
			);
			CREATE TABLE generations (
				id INTEGER PRIMARY KEY AUTOINCREMENT,
				work_unit_id INTEGER NOT NULL,
				generation INTEGER NOT NULL CHECK (generation >= 1),
				base_integration_sha TEXT NOT NULL,
				wip_ref TEXT NOT NULL,
				wip_head_sha TEXT NOT NULL,
				patch_digest TEXT NOT NULL,
				file_scope_json TEXT NOT NULL,
				checkpoint_kind TEXT NOT NULL
					CHECK (checkpoint_kind IN ('durability', 'merge-candidate')),
				candidate_state TEXT NOT NULL,
				validation_state TEXT NOT NULL,
				ci_result TEXT,
				author_agent_id TEXT NOT NULL,
				machine_id TEXT NOT NULL,
				pull_request_id INTEGER,
				integrated_sha TEXT,
				UNIQUE (work_unit_id, generation),
				CHECK (checkpoint_kind = 'merge-candidate' OR integrated_sha IS NULL)
			);
			CREATE TABLE claims (
				id INTEGER PRIMARY KEY AUTOINCREMENT,
				repository_id INTEGER NOT NULL,
				path TEXT NOT NULL,
				owner_agent_id TEXT NOT NULL,
				lease_id TEXT NOT NULL,
				work_unit_id INTEGER NOT NULL,
				claimed_at INTEGER NOT NULL,
				released_at INTEGER
			);
			CREATE UNIQUE INDEX idx_claims_active_path
				ON claims (repository_id, path) WHERE released_at IS NULL;
			CREATE TABLE pull_requests (
				id INTEGER PRIMARY KEY AUTOINCREMENT,
				repository_id INTEGER NOT NULL,
				number INTEGER NOT NULL,
				head_ref TEXT NOT NULL,
				base_ref TEXT NOT NULL,
				head_sha TEXT NOT NULL,
				state TEXT NOT NULL,
				merge_sha TEXT,
				UNIQUE (repository_id, number)
			);
			CREATE TABLE ci_runs (
				id INTEGER PRIMARY KEY AUTOINCREMENT,
				repository_id INTEGER NOT NULL,
				candidate_sha TEXT NOT NULL,
				workflow TEXT NOT NULL,
				check_name TEXT NOT NULL,
				external_id TEXT,
				state TEXT NOT NULL,
				started_at INTEGER,
				completed_at INTEGER,
				UNIQUE (repository_id, candidate_sha, workflow, check_name)
			);
			CREATE TABLE work_reconciliation_runs (
				id INTEGER PRIMARY KEY AUTOINCREMENT,
				machine_id TEXT NOT NULL,
				repository_id INTEGER,
				started_at INTEGER NOT NULL,
				completed_at INTEGER,
				status TEXT NOT NULL,
				refs_discovered INTEGER NOT NULL DEFAULT 0,
				work_units_repaired INTEGER NOT NULL DEFAULT 0,
				generations_repaired INTEGER NOT NULL DEFAULT 0,
				claims_released INTEGER NOT NULL DEFAULT 0,
				anomalies_json TEXT,
				error TEXT
			);
			CREATE TABLE projections (
				name TEXT PRIMARY KEY,
				source_digest TEXT NOT NULL,
				rebuilt_at INTEGER NOT NULL
			);
		`,
	},
	{
		version: 3,
		name: '0003_coordination_journal.sql',
		sql: `
			CREATE TABLE coordination_journal (
				id INTEGER PRIMARY KEY AUTOINCREMENT,
				event_id TEXT NOT NULL UNIQUE,
				event_kind TEXT NOT NULL,
				repository_uid TEXT,
				work_unit_uid TEXT,
				proposal_uid TEXT,
				slice_uid TEXT,
				generation INTEGER,
				actor_agent_id TEXT,
				machine_id TEXT,
				occurred_at INTEGER NOT NULL,
				recorded_at INTEGER NOT NULL,
				payload_json TEXT NOT NULL
			);
		`,
	},
];

/** Open (creating when asked) and stamp the migration bookkeeping table. */
export const openTestDatabase = (path: string): DatabaseSync => {
	// SQLite creates the FILE, never its parent directory.
	mkdirSync(dirname(path), { recursive: true });
	const db = new DatabaseSync(path);
	db.exec('PRAGMA foreign_keys = ON;');
	db.exec(`CREATE TABLE IF NOT EXISTS schema_migrations (
		version INTEGER PRIMARY KEY,
		name TEXT NOT NULL,
		applied_at INTEGER NOT NULL
	);`);
	return db;
};

/** Versions already applied, ascending. */
export const appliedVersions = (db: DatabaseSync): readonly number[] =>
	db
		.prepare('SELECT version FROM schema_migrations ORDER BY version')
		.all()
		.map((row) => Number(row.version));

/** Apply the listed migrations that are still pending. */
export const applyTestMigrations = (
	db: DatabaseSync,
	migrations: readonly ITestMigration[],
	now: number,
): readonly string[] => {
	const applied = new Set(appliedVersions(db));
	const names: string[] = [];
	for (const migration of migrations) {
		if (applied.has(migration.version) || migration.ambiguous === true) {
			continue;
		}
		db.exec('BEGIN IMMEDIATE');
		try {
			db.exec(migration.sql);
			db.prepare(
				'INSERT INTO schema_migrations (version, name, applied_at) VALUES (?, ?, ?)',
			).run(migration.version, migration.name, now);
			db.exec('COMMIT');
		} catch (error) {
			db.exec('ROLLBACK');
			throw error;
		}
		names.push(migration.name);
	}
	return names;
};

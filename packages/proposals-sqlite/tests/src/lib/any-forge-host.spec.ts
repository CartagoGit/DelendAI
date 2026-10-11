/**
 * any-forge-host.spec.ts — a repository's forge is any host.
 *
 * Startup names a forge after its remote: a short name for the hosts that
 * have one, the hostname for every other. The table accepted four names,
 * so a project on a self-hosted forge could not boot. 0024 rebuilds the
 * table; these pin that it takes any host and keeps the rows it had.
 */
import { Database } from 'bun:sqlite';
import { describe, expect, it } from 'bun:test';

import {
	migrationChecksums,
	migrationFiles,
	applyMigrations,
	readMigrationSource,
} from '../../../src/lib/migrations';
import { WorkRegistryRepo } from '../../../src/lib/work-model/registry-repo';

/** A database built by the migrations before `version`, as it was then. */
const atVersion = (version: number): Database => {
	const db = new Database(':memory:');
	db.exec(`CREATE TABLE schema_migrations (
		version INTEGER PRIMARY KEY, name TEXT NOT NULL,
		checksum TEXT NOT NULL, applied_at INTEGER NOT NULL);`);
	for (const name of migrationFiles()) {
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
			migrationChecksums()[name] ?? '',
			1_700_000_000_000 + at,
		);
	}
	return db;
};

const register = (db: Database, forge: string) =>
	new WorkRegistryRepo(db).registerRepository({
		forge,
		owner: 'team',
		name: 'app',
		integrationBranch: 'develop',
		releaseBranch: 'main',
		now: 1_000,
	});

describe('a repository on any forge', () => {
	it('registers a self-hosted host and bitbucket on a fresh database', () => {
		const db = new Database(':memory:');
		applyMigrations(db);
		expect(register(db, 'forge.example.org').forge).toBe(
			'forge.example.org',
		);
		expect(register(db, 'bitbucket').forge).toBe('bitbucket');
	});

	it('refuses an empty or uppercase forge', () => {
		const db = new Database(':memory:');
		applyMigrations(db);
		expect(() => register(db, '')).toThrow();
		expect(() => register(db, 'Forge.Example.org')).toThrow();
	});

	it('keeps the rows, ids and counter of a database from before', () => {
		const db = atVersion(24);
		const before = register(db, 'github');
		expect(() => register(db, 'forge.example.org')).toThrow();
		applyMigrations(db);
		expect(register(db, 'github').id).toBe(before.id);
		expect(register(db, 'forge.example.org').id).toBeGreaterThan(before.id);
		expect(db.query('PRAGMA foreign_key_check').all()).toEqual([]);
	});
});

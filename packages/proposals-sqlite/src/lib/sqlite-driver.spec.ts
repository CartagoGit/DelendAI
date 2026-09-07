/**
 * sqlite-driver.spec.ts — q00022 S1.
 *
 * Verifies the proposals-sqlite driver:
 *   - boots with the right PRAGMAs (foreign_keys, WAL, busy_timeout)
 *   - applies the 5 migrations in order
 *   - sets user_version to PROPOSALS_SQLITE_SCHEMA_VERSION
 *   - enforces FK (proposal → plans → slices chain)
 *   - enforces CHECK on status / kind columns
 *   - is idempotent on a re-open (no duplicate schema_migrations rows)
 */
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
	MIGRATION_CHECKSUMS,
	MIGRATION_FILES,
	MigrationChecksumMismatchError,
	applyMigrations,
	currentSchemaVersion,
} from './migrations.ts';
import {
	PROPOSALS_SQLITE_SCHEMA_VERSION,
	SQLITE_BOOT_PRAGMAS,
} from './schema.ts';
import { ProposalsSqliteDriver } from './sqlite-driver.ts';

const makeTmpPath = (): { dir: string; path: string } => {
	const dir = mkdtempSync(join(tmpdir(), 'proposals-sqlite-'));
	return { dir, path: join(dir, 'proposals.sqlite') };
};

describe('proposals-sqlite driver (q00022 S1)', () => {
	let tmpDir: string;
	let dbPath: string;
	beforeEach(() => {
		const t = makeTmpPath();
		tmpDir = t.dir;
		dbPath = t.path;
	});
	afterEach(() => {
		rmSync(tmpDir, { recursive: true, force: true });
	});

	it('MIGRATION_FILES lists five migrations in order', () => {
		expect(MIGRATION_FILES).toEqual([
			'0001_initial.sql',
			'0002_reconciliation_runs.sql',
			'0003_lifecycle_events.sql',
			'0004_outbox.sql',
			'0005_quarantine_and_tombstones.sql',
		]);
		expect(MIGRATION_CHECKSUMS).toBeDefined();
		for (const name of MIGRATION_FILES) {
			expect(MIGRATION_CHECKSUMS[name]).toMatch(/^[0-9a-f]{64}$/);
		}
	});

	it('boot pragmas include foreign_keys, WAL, busy_timeout, and the schema version', () => {
		expect(SQLITE_BOOT_PRAGMAS).toEqual([
			'PRAGMA foreign_keys = ON;',
			'PRAGMA journal_mode = WAL;',
			'PRAGMA synchronous = NORMAL;',
			'PRAGMA busy_timeout = 5000;',
			`PRAGMA user_version = ${String(PROPOSALS_SQLITE_SCHEMA_VERSION)};`,
		]);
		expect(PROPOSALS_SQLITE_SCHEMA_VERSION).toBe(5);
	});

	it('applies all migrations on first open', () => {
		const driver = new ProposalsSqliteDriver({ path: dbPath });
		try {
			expect(driver.schemaVersion).toBe(PROPOSALS_SQLITE_SCHEMA_VERSION);
			const handle = driver.handle;
			const rows = handle
				.query<{ count: number }, []>(
					'SELECT COUNT(*) AS count FROM schema_migrations',
				)
				.get();
			expect(rows?.count).toBe(PROPOSALS_SQLITE_SCHEMA_VERSION);
		} finally {
			driver.close();
		}
	});

	it('opening twice does not re-apply the migrations', () => {
		const a = new ProposalsSqliteDriver({ path: dbPath });
		a.close();
		const b = new ProposalsSqliteDriver({ path: dbPath });
		try {
			const rows = b.handle
				.query<{ count: number }, []>(
					'SELECT COUNT(*) AS count FROM schema_migrations',
				)
				.get();
			expect(rows?.count).toBe(PROPOSALS_SQLITE_SCHEMA_VERSION);
		} finally {
			b.close();
		}
	});

	it('enforces FK (cannot create plan without proposal)', () => {
		const driver = new ProposalsSqliteDriver({ path: dbPath });
		try {
			expect(() =>
				driver.handle
					.prepare(
						"INSERT INTO plans (uid, proposal_id, slug, title, created_at, updated_at) VALUES ('q00099', 99999, 's', 't', 0, 0)",
					)
					.run(),
			).toThrow(/FOREIGN KEY/);
		} finally {
			driver.close();
		}
	});

	it('enforces CHECK on proposals.status', () => {
		const driver = new ProposalsSqliteDriver({ path: dbPath });
		try {
			expect(() =>
				driver.handle
					.prepare(
						"INSERT INTO proposals (uid, slug, kind, status, title, created_at, updated_at) VALUES ('x00001', 's', 'feat', 'bogus', 't', 0, 0)",
					)
					.run(),
			).toThrow(/CHECK/);
		} finally {
			driver.close();
		}
	});

	it('currentSchemaVersion returns 0 on a fresh DB without schema_migrations', () => {
		// Open a NEW path (not the one the driver already touched in
		// the previous tests) so we hit the empty-DB branch.
		const { Database } =
			require('bun:sqlite') as typeof import('bun:sqlite');
		const freshPath = join(tmpDir, 'fresh-proposals.sqlite');
		const raw = new Database(freshPath, { create: true, strict: true });
		try {
			expect(currentSchemaVersion(raw)).toBe(0);
		} finally {
			raw.close();
		}
	});

	it('refuses to apply a migration whose stored checksum differs from the file', () => {
		const driver = new ProposalsSqliteDriver({ path: dbPath });
		try {
			driver.handle
				.prepare(
					"UPDATE schema_migrations SET checksum = '0000000000000000000000000000000000000000000000000000000000000000' WHERE version = 1",
				)
				.run();
		} finally {
			driver.close();
		}
		expect(() => new ProposalsSqliteDriver({ path: dbPath })).toThrow(
			MigrationChecksumMismatchError,
		);
	});

	it('applyMigrations is a no-op on an up-to-date DB', () => {
		const driver = new ProposalsSqliteDriver({ path: dbPath });
		try {
			const before = driver.handle
				.query<{ count: number }, []>(
					'SELECT COUNT(*) AS count FROM schema_migrations',
				)
				.get();
			const outcome = applyMigrations(driver.handle);
			expect(outcome.applied).toEqual([]);
			expect(outcome.totalApplied).toBe(0);
			const after = driver.handle
				.query<{ count: number }, []>(
					'SELECT COUNT(*) AS count FROM schema_migrations',
				)
				.get();
			expect(after?.count).toBe(before?.count);
		} finally {
			driver.close();
		}
	});
});

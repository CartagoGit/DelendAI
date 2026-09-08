/**
 * sqlite-driver.spec.ts — q00022 S1 + x00511 S1.
 *
 * Verifies the proposals-sqlite driver:
 *   - boots with the right PRAGMAs (foreign_keys, WAL, busy_timeout)
 *   - applies the 5 migrations in order
 *   - sets user_version to PROPOSALS_SQLITE_SCHEMA_VERSION ONLY after
 *     a successful migration sweep (x00511 — `user_version` is no
 *     longer in the boot PRAGMAs, so a half-applied schema leaves
 *     `user_version` at the OLD value, never ahead of
 *     `schema_migrations`)
 *   - opens a TRUE read-only handle when `readonly: true` is passed
 *     (x00511 — mutations throw)
 *   - applies each migration under `BEGIN IMMEDIATE` (x00511 — the
 *     call shape is pinned by a monkey-patch spec)
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
	parseMigrationVersion,
} from './migrations.ts';
import {
	PROPOSALS_SQLITE_SCHEMA_VERSION,
	SQLITE_BOOT_PRAGMAS,
} from './schema.ts';
import { ProposalsSqliteDriver } from './sqlite-driver.ts';
import { resolveProposalsDbPaths } from './db-path.ts';

const makeTmpPath = (): { dir: string; path: string } => {
	const dir = mkdtempSync(join(tmpdir(), 'proposals-sqlite-'));
	return {
		dir,
		path: resolveProposalsDbPaths(dir, { stateDir: dir }).databasePath,
	};
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

	it('MIGRATION_FILES lists the migrations in order', () => {
		expect(MIGRATION_FILES).toEqual([
			'0001_initial.sql',
			'0002_reconciliation_runs.sql',
			'0003_lifecycle_events.sql',
			'0004_outbox.sql',
			'0005_quarantine_and_tombstones.sql',
			'0006_mutation_commands.sql',
			'0007_lifecycle_events_append_only_guards.sql',
			'0008_plan_slice_lifecycle_parity.sql',
			'0009_outbox_leases.sql',
			'0010_fts5.sql',
		]);
		expect(MIGRATION_CHECKSUMS).toBeDefined();
		for (const name of MIGRATION_FILES) {
			expect(MIGRATION_CHECKSUMS[name]).toMatch(/^[0-9a-f]{64}$/);
		}
	});

	it('supports 5+ digit migration versions', () => {
		expect(parseMigrationVersion('10000_future.sql')).toBe(10000);
		expect(parseMigrationVersion('0009_initial.sql')).toBe(9);
		expect(() => parseMigrationVersion('future.sql')).toThrow(
			/Invalid migration filename/
		);
	});

	it('boot pragmas include foreign_keys, WAL, busy_timeout — but NOT user_version (x00511)', () => {
		// x00511 — `user_version` was removed from the boot PRAGMAs so it
		// can never be written before migrations succeed. The driver
		// stamps it after a successful migration sweep instead.
		expect(SQLITE_BOOT_PRAGMAS).toEqual([
			'PRAGMA foreign_keys = ON;',
			'PRAGMA journal_mode = WAL;',
			'PRAGMA synchronous = NORMAL;',
			'PRAGMA busy_timeout = 5000;',
		]);
		// Pinned to the real invariant rather than to a literal: the schema
		// version IS the number of applied migrations. `44f403eca` added
		// `0010_fts5.sql` without bumping the constant, and a hardcoded
		// `toBe(9)` here turned every future migration into a failing test
		// in a spec that is not about migration counts at all.
		expect(PROPOSALS_SQLITE_SCHEMA_VERSION).toBe(MIGRATION_FILES.length);
		expect(
			SQLITE_BOOT_PRAGMAS.some((p) => p.startsWith('PRAGMA user_version'))
		).toBe(false);
	});

	it('applies all migrations on first open', () => {
		const driver = new ProposalsSqliteDriver({ path: dbPath });
		try {
			expect(driver.schemaVersion).toBe(PROPOSALS_SQLITE_SCHEMA_VERSION);
			const handle = driver.handle;
			const rows = handle
				.query<
					{ count: number },
					[]
				>('SELECT COUNT(*) AS count FROM schema_migrations')
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
				.query<
					{ count: number },
					[]
				>('SELECT COUNT(*) AS count FROM schema_migrations')
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
						"INSERT INTO plans (uid, proposal_id, slug, title, created_at, updated_at) VALUES ('q00099', 99999, 's', 't', 0, 0)"
					)
					.run()
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
						"INSERT INTO proposals (uid, slug, kind, status, title, created_at, updated_at) VALUES ('x00001', 's', 'feat', 'bogus', 't', 0, 0)"
					)
					.run()
			).toThrow(/CHECK/);
		} finally {
			driver.close();
		}
	});

	it('gives plans and slices explicit status parity with closed_at invariants', () => {
		const driver = new ProposalsSqliteDriver({ path: dbPath });
		try {
			driver.handle
				.prepare(
					"INSERT INTO proposals (uid, slug, kind, status, title, created_at, updated_at) VALUES ('x00001', 'x00001', 'fix', 'ready', 't', 0, 0)"
				)
				.run();

			driver.handle
				.prepare(
					"INSERT INTO plans (uid, proposal_id, slug, title, created_at, updated_at) VALUES ('q00001', 1, 'q00001', 'plan', 0, 0)"
				)
				.run();

			const plan = driver.handle
				.query<
					{ status: string },
					[]
				>("SELECT status FROM plans WHERE uid = 'q00001'")
				.get();
			expect(plan?.status).toBe('ready');

			expect(() =>
				driver.handle
					.prepare(
						"INSERT INTO plans (uid, proposal_id, slug, title, status, created_at, updated_at) VALUES ('q00002', 1, 'q00002', 'plan', 'bogus', 0, 0)"
					)
					.run()
			).toThrow(/CHECK/);

			expect(() =>
				driver.handle
					.prepare(
						"INSERT INTO slices (uid, plan_id, slug, title, status, created_at, updated_at) VALUES ('s00001', 1, 's00001', 'slice', 'done', 0, 0)"
					)
					.run()
			).toThrow(/closed_at/);
		} finally {
			driver.close();
		}
	});

	it('adds lease metadata to outbox rows for crash recovery', () => {
		const driver = new ProposalsSqliteDriver({ path: dbPath });
		try {
			driver.handle
				.prepare(
					"INSERT INTO outbox (idempotency_key, kind, payload, status, attempts, last_error, next_attempt_at, lease_owner, lease_expires_at, created_at, updated_at) VALUES ('idem-1', 'kind', '{}', 'in-flight', 1, NULL, 0, 'worker-1', 50, 0, 0)"
				)
				.run();

			const row = driver.handle
				.query<
					{
						lease_owner: string | null;
						lease_expires_at: number | null;
					},
					[]
				>("SELECT lease_owner, lease_expires_at FROM outbox WHERE idempotency_key = 'idem-1'")
				.get();
			expect(row).toEqual({
				lease_owner: 'worker-1',
				lease_expires_at: 50,
			});
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
					"UPDATE schema_migrations SET checksum = '0000000000000000000000000000000000000000000000000000000000000000' WHERE version = 1"
				)
				.run();
		} finally {
			driver.close();
		}
		expect(() => new ProposalsSqliteDriver({ path: dbPath })).toThrow(
			MigrationChecksumMismatchError
		);
	});

	it('applyMigrations is a no-op on an up-to-date DB', () => {
		const driver = new ProposalsSqliteDriver({ path: dbPath });
		try {
			const before = driver.handle
				.query<
					{ count: number },
					[]
				>('SELECT COUNT(*) AS count FROM schema_migrations')
				.get();
			const outcome = applyMigrations(driver.handle);
			expect(outcome.applied).toEqual([]);
			expect(outcome.totalApplied).toBe(0);
			const after = driver.handle
				.query<
					{ count: number },
					[]
				>('SELECT COUNT(*) AS count FROM schema_migrations')
				.get();
			expect(after?.count).toBe(before?.count);
		} finally {
			driver.close();
		}
	});

	it('x00511 — stamps user_version to PROPOSALS_SQLITE_SCHEMA_VERSION after a successful first open', () => {
		// Fresh DB: user_version starts at 0; after a successful migration
		// sweep the driver writes the latest schema version. The boot
		// PRAGMAs no longer touch user_version, so this is the only
		// writer.
		const driver = new ProposalsSqliteDriver({ path: dbPath });
		try {
			const uv = driver.handle
				.query<{ user_version: number }, []>('PRAGMA user_version')
				.get();
			expect(uv?.user_version).toBe(PROPOSALS_SQLITE_SCHEMA_VERSION);
		} finally {
			driver.close();
		}
	});

	it('x00511 — keeps user_version in sync with schema_migrations on re-open', () => {
		// First open applies 5 migrations and stamps user_version = 5.
		// Re-open must NOT regress user_version (the boot PRAGMAs no
		// longer touch it) and must NOT regress schema_migrations either.
		const a = new ProposalsSqliteDriver({ path: dbPath });
		a.close();
		const b = new ProposalsSqliteDriver({ path: dbPath });
		try {
			const uv = b.handle
				.query<{ user_version: number }, []>('PRAGMA user_version')
				.get();
			expect(uv?.user_version).toBe(PROPOSALS_SQLITE_SCHEMA_VERSION);
			expect(b.schemaVersion).toBe(PROPOSALS_SQLITE_SCHEMA_VERSION);
		} finally {
			b.close();
		}
	});

	it('x00511 — readonly: true opens a true read-only handle (mutations throw)', () => {
		// Seed a writable DB first so the read-only handle has something
		// to inspect. Re-open the same file with readonly: true and
		// assert that every write attempt throws.
		const writer = new ProposalsSqliteDriver({ path: dbPath });
		writer.close();
		const ro = new ProposalsSqliteDriver({ path: dbPath, readonly: true });
		try {
			expect(() =>
				ro.handle.exec(
					"INSERT INTO proposals (uid, slug, kind, status, title, created_at, updated_at) VALUES ('ro-test', 'ro', 'feat', 'draft', 't', 0, 0)"
				)
			).toThrow();
			// Reading still works.
			const uv = ro.handle
				.query<{ user_version: number }, []>('PRAGMA user_version')
				.get();
			expect(uv?.user_version).toBe(PROPOSALS_SQLITE_SCHEMA_VERSION);
		} finally {
			ro.close();
		}
	});

	it('x00511 — readonly: true preserves the on-disk state (no migrations, no user_version write)', () => {
		// The constructor's `if (!options.readonly)` guard is verified
		// here: a writable driver drops `schema_migrations` to simulate
		// a half-applied schema; a readonly driver opened against the
		// SAME file MUST NOT repair it. Bun refuses to open a
		// non-existent file with `readonly: true`, so we seed it first
		// and assert the constructor took the readonly branch (no rows
		// added, no user_version write).
		const writer = new ProposalsSqliteDriver({ path: dbPath });
		writer.handle.exec('DROP TABLE schema_migrations');
		writer.close();

		const ro = new ProposalsSqliteDriver({ path: dbPath, readonly: true });
		try {
			const row = ro.handle
				.query<
					{ name: string | null },
					[]
				>("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'schema_migrations'")
				.get();
			// schema_migrations was dropped before the readonly open and
			// the readonly branch did NOT recreate it. If the readonly
			// handle had run migrations, this would be 'schema_migrations'.
			expect(row?.name ?? null).toBeNull();
		} finally {
			ro.close();
		}
	});

	it('x00511 — applyMigrations invokes .immediate() (BEGIN IMMEDIATE), not bare tx() (BEGIN)', () => {
		// Pin the call shape so a future refactor that drops
		// `.immediate()` fails CI. We wrap the driver's own DB so we can
		// observe every `db.transaction(...)` return value and assert
		// that the migrations path invoked `.immediate()` on the
		// returned object.
		const { Database } =
			require('bun:sqlite') as typeof import('bun:sqlite');
		type BunDatabase = InstanceType<typeof Database>;
		type BunTransaction = ReturnType<BunDatabase['transaction']>;
		const freshPath = join(tmpDir, 'immediate-pin.sqlite');
		const raw = new Database(freshPath, {
			create: true,
			strict: true,
		}) as BunDatabase;
		try {
			const observed: Array<{ kind: 'immediate' | 'bare' }> = [];
			const originalTransaction = raw.transaction.bind(raw);
			(
				raw as unknown as { transaction: BunDatabase['transaction'] }
			).transaction = ((
				fn: (...args: never[]) => unknown
			): BunTransaction => {
				const tx = originalTransaction(fn) as BunTransaction;
				const wrapped: Partial<BunTransaction> = {
					immediate: () => {
						observed.push({ kind: 'immediate' });
						return tx.immediate();
					},
					deferred: () => {
						observed.push({ kind: 'bare' });
						return tx.deferred();
					},
				};
				return wrapped as BunTransaction;
			}) as BunDatabase['transaction'];
			applyMigrations(raw);
			expect(observed.length).toBeGreaterThan(0);
			expect(observed.every((o) => o.kind === 'immediate')).toBe(true);
		} finally {
			raw.close();
		}
	});
});

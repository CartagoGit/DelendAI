/**
 * migrations.spec.ts — the work-model schema against a REAL database.
 *
 * Proves the two things a migration set has to prove: it applies from
 * an empty file, and applying it again does nothing. The second is not
 * cosmetic — every process that opens the database runs the sweep, so
 * a non-idempotent migration would corrupt the schema on the second
 * open of the day.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { applyMigrations, MIGRATION_FILES } from '../../../../src/lib/migrations';
import { PROPOSALS_SQLITE_SCHEMA_VERSION } from '../../../../src/lib/schema';
import { makeFixture, ProposalsSqliteDriver, type IWorkModelFixture } from './fixture';

const WORK_MODEL_TABLES = [
	'repositories',
	'machines',
	'agents',
	'leases',
	'pull_requests',
	'ci_runs',
	'work_units',
	'work_unit_owners',
	'generations',
	'claims',
	'work_reconciliation_runs',
	'coordination_journal',
] as const;

describe('work model migrations', () => {
	let fixture: IWorkModelFixture;

	beforeEach(() => {
		fixture = makeFixture('migrations');
	});

	afterEach(() => fixture.dispose());

	it('applies from scratch and creates every work-model table', () => {
		const driver = new ProposalsSqliteDriver({ path: fixture.dbPath });
		try {
			const names = new Set(
				driver.handle
					.query<{ name: string }, []>(
						"SELECT name FROM sqlite_master WHERE type = 'table'",
					)
					.all()
					.map((row) => row.name),
			);
			for (const table of WORK_MODEL_TABLES) {
				expect(names.has(table)).toBe(true);
			}
			expect(driver.schemaVersion).toBe(PROPOSALS_SQLITE_SCHEMA_VERSION);
			expect(PROPOSALS_SQLITE_SCHEMA_VERSION).toBe(
				MIGRATION_FILES.length,
			);
		} finally {
			driver.close();
		}
	});

	it('is idempotent: a second sweep applies nothing', () => {
		const driver = new ProposalsSqliteDriver({ path: fixture.dbPath });
		try {
			const second = applyMigrations(driver.handle);
			expect(second.totalApplied).toBe(0);
			const rows = driver.handle
				.query<{ count: number }, []>(
					'SELECT COUNT(*) AS count FROM schema_migrations',
				)
				.get();
			expect(rows?.count).toBe(MIGRATION_FILES.length);
		} finally {
			driver.close();
		}
	});

	it('re-opening the database twice leaves one row per migration', () => {
		const first = new ProposalsSqliteDriver({ path: fixture.dbPath });
		first.close();
		const second = new ProposalsSqliteDriver({ path: fixture.dbPath });
		try {
			const duplicates = second.handle
				.query<{ version: number; count: number }, []>(
					`SELECT version, COUNT(*) AS count FROM schema_migrations
					 GROUP BY version HAVING count > 1`,
				)
				.all();
			expect(duplicates).toEqual([]);
		} finally {
			second.close();
		}
	});

	it('enforces the exclusive path claim with a partial unique index', () => {
		const driver = new ProposalsSqliteDriver({ path: fixture.dbPath });
		try {
			const index = driver.handle
				.query<{ sql: string | null }, []>(
					`SELECT sql FROM sqlite_master
					 WHERE type = 'index' AND name = 'idx_claims_active_path'`,
				)
				.get();
			expect(index?.sql).toContain('WHERE released_at IS NULL');
		} finally {
			driver.close();
		}
	});
});

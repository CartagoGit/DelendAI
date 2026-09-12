/**
 * recovery.spec.ts — the laptop's locks must not follow you to the
 * office, and an older database must catch up by itself.
 *
 * The first two tests are the same story from both ends: a lease and a
 * claim written by a machine that is no longer running must be reaped
 * (they describe a process that does not exist), and the work they owned
 * must survive as RECOVERABLE rather than be deleted — the difference
 * between "somebody can continue this" and "an afternoon is gone".
 *
 * The third is the "no manual commands" promise at the schema level: a
 * database left at an older version is migrated during the boot, and the
 * derived index is rebuilt, with nobody typing `run migrate`.
 */

import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
	createStartupMutex,
	reconcileStartup,
} from '@delendai/core/lib/startup-reconciler/index';

import { environmentSeam, REPOSITORY, testClock, testPolicy } from './fakes';
import { createTestStateDatabase } from './sqlite-state';
import {
	applyTestMigrations,
	openTestDatabase,
	TEST_MIGRATIONS,
} from './sqlite-schema';
import {
	createStartupOrigin,
	type IStartupClone,
	type IStartupOrigin,
} from './startup-workspace';

const REF = 'refs/wip/agent-a/f1-s1-g1';
const NOW = 1_700_000_000_000;

describe('startup recovery', () => {
	let origin: IStartupOrigin;
	let office: IStartupClone;
	let dbPath: string;

	beforeEach(async () => {
		origin = createStartupOrigin();
		const laptop = origin.clone('laptop');
		laptop.write('src/alpha.ts', 'export const alpha = 2;\n');
		await laptop.checkpoint({
			ref: REF,
			paths: ['src/alpha.ts'],
			message: 'wip a',
		});
		laptop.push(`${REF}:${REF}`);
		office = origin.clone('office');
		dbPath = join(office.dir, '.delendai', 'state', 'work.sqlite');
	});

	afterEach(() => {
		origin.cleanup();
	});

	const boot = async (
		database: ReturnType<typeof createTestStateDatabase>,
	) => {
		const clock = testClock(NOW);
		return reconcileStartup({
			policy: testPolicy(),
			environmentSeam: environmentSeam({
				workspaceRoot: office.dir,
				machineId: 'office',
				agentId: 'agent-office',
			}),
			database,
			git: office.seam,
			mutex: createStartupMutex({
				path: join(office.dir, '.delendai', 'startup.lock'),
				machineId: 'office',
				clock,
			}),
			clock,
		});
	};

	it('reaps the other machine’s dead lease and keeps its work', async () => {
		// Seed the state the laptop left behind: a lease that expired an
		// hour ago, a claim it held, and the work unit it owned.
		const seed = openTestDatabase(dbPath);
		applyTestMigrations(seed, TEST_MIGRATIONS, NOW);
		const uid = `${REPOSITORY.forge}:${REPOSITORY.owner}/${REPOSITORY.name}#f1/s1`;
		seed.prepare(
			`INSERT INTO repositories (forge, owner, name, integration_branch, release_branch)
			 VALUES (?, ?, ?, 'develop', 'main')`,
		).run(REPOSITORY.forge, REPOSITORY.owner, REPOSITORY.name);
		seed.prepare(
			`INSERT INTO work_units (
				uid, repository_id, proposal_uid, slice_uid, state,
				current_generation, current_owner_agent_id, created_by_agent_id,
				created_at, updated_at
			) VALUES (?, 1, 'f1', 's1', 'in-progress', 1, 'agent-a', 'agent-a', ?, ?)`,
		).run(uid, NOW - 7_200_000, NOW - 7_200_000);
		seed.prepare(
			`INSERT INTO leases (id, owner_agent_id, machine_id, acquired_at, heartbeat_at, expires_at)
			 VALUES ('lease-laptop', 'agent-a', 'laptop', ?, ?, ?)`,
		).run(NOW - 7_200_000, NOW - 7_200_000, NOW - 3_600_000);
		seed.prepare(
			`INSERT INTO claims (repository_id, path, owner_agent_id, lease_id, work_unit_id, claimed_at)
			 VALUES (1, 'src/alpha.ts', 'agent-a', 'lease-laptop', 1, ?)`,
		).run(NOW - 7_200_000);
		seed.close();

		const database = createTestStateDatabase({ path: dbPath });
		const report = await boot(database);

		expect(report.status).toBe('READY');
		expect(report.counters.leasesExpired).toBe(1);
		expect(report.counters.claimsReleased).toBe(1);
		expect(report.counters.workUnitsRecoverable).toBe(1);

		const db = database.handle();
		if (db === undefined) throw new Error('database not opened');
		const unit = db
			.prepare('SELECT state FROM work_units WHERE uid = ?')
			.get(uid);
		// RECOVERABLE, not gone.
		expect(unit?.state).toBe('recoverable');
		const live = db
			.prepare(
				'SELECT COUNT(*) AS n FROM leases WHERE released_at IS NULL',
			)
			.get();
		expect(Number(live?.n)).toBe(0);
		const claims = db
			.prepare(
				'SELECT COUNT(*) AS n FROM claims WHERE released_at IS NULL',
			)
			.get();
		expect(Number(claims?.n)).toBe(0);
		// The recovery decision is journalled, and replaying the boot does
		// not journal it twice.
		const journal = db
			.prepare(
				"SELECT COUNT(*) AS n FROM coordination_journal WHERE event_kind = 'slice-recovered'",
			)
			.get();
		expect(Number(journal?.n)).toBe(1);

		await boot(database);
		const after = db
			.prepare(
				"SELECT COUNT(*) AS n FROM coordination_journal WHERE event_kind = 'slice-recovered'",
			)
			.get();
		expect(Number(after?.n)).toBe(1);
		database.close();
	});

	it('applies pending migrations and rebuilds the derived index at boot', async () => {
		const first = TEST_MIGRATIONS[0];
		if (first === undefined) throw new Error('no migrations');
		const seed = openTestDatabase(dbPath);
		applyTestMigrations(seed, [first], NOW);
		seed.close();

		const database = createTestStateDatabase({ path: dbPath });
		const report = await boot(database);

		expect(report.status).toBe('READY');
		expect(report.counters.migrationsApplied).toBe(
			TEST_MIGRATIONS.length - 1,
		);
		expect(report.counters.projectionsRebuilt).toBe(1);
		const db = database.handle();
		if (db === undefined) throw new Error('database not opened');
		const version = db
			.prepare('SELECT MAX(version) AS v FROM schema_migrations')
			.get();
		expect(Number(version?.v)).toBe(TEST_MIGRATIONS.length);
		database.close();
	});
});

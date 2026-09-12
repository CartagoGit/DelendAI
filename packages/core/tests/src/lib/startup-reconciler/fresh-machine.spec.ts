/**
 * fresh-machine.spec.ts — the laptop/office scenario, end to end.
 *
 * One machine checkpoints work into a `wip/*` ref and pushes it. A second
 * machine — a fresh clone with NO state database at all — starts the
 * server and must end up knowing about that work, its pull request, its
 * CI verdict and the coordination events that explain it, without anyone
 * running a command. Everything here is real except the forge: a real
 * bare origin, two real clones, real refs written by the shipped WIP
 * engine, and a real SQLite file created during the boot.
 */

import { existsSync } from 'node:fs';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
	createStartupMutex,
	reconcileStartup,
} from '@delendai/core/lib/startup-reconciler/index';

import {
	environmentSeam,
	fakeForge,
	fakeJournalSource,
	testClock,
	testPolicy,
} from './fakes';
import { countRows, createTestStateDatabase } from './sqlite-state';
import {
	createStartupOrigin,
	type IStartupClone,
	type IStartupOrigin,
} from './startup-workspace';

const WORK_REF = 'refs/wip/agent-a/f1-s1-g1';

describe('reconcileStartup on a fresh machine', () => {
	let origin: IStartupOrigin;
	let laptop: IStartupClone;
	let office: IStartupClone;
	let wipSha: string;

	beforeEach(async () => {
		origin = createStartupOrigin();
		laptop = origin.clone('laptop');
		laptop.write('src/alpha.ts', 'export const alpha = 2;\n');
		wipSha = await laptop.checkpoint({
			ref: WORK_REF,
			paths: ['src/alpha.ts'],
			message: 'wip: alpha',
		});
		laptop.push(`${WORK_REF}:${WORK_REF}`);
		office = origin.clone('office');
	});

	afterEach(() => {
		origin.cleanup();
	});

	it('rebuilds the work model from refs, the forge and the journal', async () => {
		const dbPath = join(office.dir, '.delendai', 'state', 'work.sqlite');
		expect(existsSync(dbPath)).toBe(false);
		const database = createTestStateDatabase({ path: dbPath });
		const clock = testClock();

		const report = await reconcileStartup({
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
			forge: fakeForge({
				pullRequests: [
					{
						number: 7,
						headRef: WORK_REF,
						baseRef: 'develop',
						headSha: wipSha,
						state: 'open',
					},
				],
				checkRuns: [
					{
						candidateSha: wipSha,
						workflow: 'ci',
						checkName: 'ci-complete',
						state: 'success',
					},
				],
			}),
			journalSource: fakeJournalSource([
				{
					eventKind: 'semantic-checkpoint',
					occurredAt: 1_699_000_000_000,
					machineId: 'laptop',
					payload: { note: 'slice boundary' },
				},
			]),
		});

		expect(report.blockers.map((item) => item.code)).toEqual([]);
		expect(report.status).toBe('READY');
		expect(report.mode).toBe('full');
		expect(report.counters.workUnitsRebuilt).toBe(1);
		expect(report.counters.generationsRecorded).toBe(1);
		expect(report.counters.migrationsApplied).toBeGreaterThan(0);
		expect(report.counters.projectionsRebuilt).toBeGreaterThan(0);
		expect(report.counters.journalEventsImported).toBe(1);

		const db = database.handle();
		expect(db).toBeDefined();
		if (db === undefined) return;
		expect(countRows(db, 'work_units')).toBe(1);
		expect(countRows(db, 'generations')).toBe(1);
		expect(countRows(db, 'pull_requests')).toBe(1);
		expect(countRows(db, 'ci_runs')).toBe(1);
		// The office machine fetched the ref it had never seen.
		expect(office.git('rev-parse', WORK_REF)).toBe(wipSha);
		database.close();
	});

	it('records a merge the machine slept through, from the forge alone', async () => {
		// The laptop's checkpoint merged while the office machine was off:
		// only the forge knows, and the boot must record it.
		const merged = laptop.git('rev-parse', 'HEAD');
		const dbPath = join(office.dir, '.delendai', 'state', 'work.sqlite');
		const database = createTestStateDatabase({ path: dbPath });
		const clock = testClock();

		const report = await reconcileStartup({
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
			forge: fakeForge({
				pullRequests: [
					{
						number: 9,
						headRef: WORK_REF,
						baseRef: 'develop',
						headSha: wipSha,
						state: 'merged',
						mergeSha: merged,
					},
				],
			}),
		});

		expect(report.blockers.map((item) => item.code)).toEqual([]);
		expect(report.status).toBe('READY');
		expect(report.counters.generationsIntegrated).toBe(1);
		const db = database.handle();
		if (db === undefined) throw new Error('database not opened');
		const row = db
			.prepare('SELECT integrated_sha, checkpoint_kind FROM generations')
			.get();
		expect(row?.integrated_sha).toBe(merged);
		expect(row?.checkpoint_kind).toBe('merge-candidate');
		database.close();
	});
});

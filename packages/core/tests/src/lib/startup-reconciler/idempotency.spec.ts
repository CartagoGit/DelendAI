/**
 * idempotency.spec.ts — starting the server twenty times must look like
 * starting it once, and the second start must be cheaper than the first.
 *
 * These are two different claims and both are asserted against real
 * artefacts. Idempotency is asserted by COUNTING ROWS in a real SQLite
 * file after repeated boots: if the reconciler ever addressed a row by
 * anything other than its derived identity, the unique constraints would
 * let a duplicate through and the count would move. Efficiency is
 * asserted by COUNTING WORK in the report: a warm boot must examine no
 * refs, rebuild no projections and get "not modified" from the forge.
 */

import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
	createStartupMutex,
	type IReconcileStartupInput,
	type IStartupReconciliationReport,
	reconcileStartup,
} from '@delendai/core/lib/startup-reconciler/index';

import {
	environmentSeam,
	fakeForge,
	fakeJournalSource,
	type IFakeForge,
	testClock,
	testPolicy,
} from './fakes';
import { countRows, createTestStateDatabase } from './sqlite-state';
import {
	createStartupOrigin,
	type IStartupClone,
	type IStartupOrigin,
} from './startup-workspace';

// Derived from the policy, not written out: these refs have to be
// the ones the engine would actually produce, and a literal here
// is a second copy of the naming that goes stale the moment the
// template moves — which is exactly how it went stale.
const WORK_REF = `refs/${testPolicy().branches.workRefPrefix}agent-a/f1-s1-g1`;

describe('repeated startup', () => {
	let origin: IStartupOrigin;
	let office: IStartupClone;
	let wipSha: string;
	let forge: IFakeForge;
	let database: ReturnType<typeof createTestStateDatabase>;
	let boot: () => Promise<IStartupReconciliationReport>;

	beforeEach(async () => {
		origin = createStartupOrigin();
		const laptop = origin.clone('laptop');
		laptop.write('src/alpha.ts', 'export const alpha = 2;\n');
		wipSha = await laptop.checkpoint({
			ref: WORK_REF,
			paths: ['src/alpha.ts'],
			message: 'wip: alpha',
		});
		laptop.push(`${WORK_REF}:${WORK_REF}`);
		office = origin.clone('office');

		forge = fakeForge({
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
		});
		database = createTestStateDatabase({
			path: join(office.dir, '.delendai', 'state', 'work.sqlite'),
		});
		const clock = testClock();
		const input: IReconcileStartupInput = {
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
			forge,
			journalSource: fakeJournalSource([
				{
					eventKind: 'semantic-checkpoint',
					occurredAt: 1_699_000_000_000,
					machineId: 'laptop',
					payload: { note: 'slice boundary' },
				},
			]),
		};
		boot = () => reconcileStartup(input);
	});

	afterEach(() => {
		database.close();
		origin.cleanup();
	});

	it('produces no duplicate work units, refs, pull requests or events', async () => {
		const reports: IStartupReconciliationReport[] = [];
		for (let index = 0; index < 5; index += 1) {
			reports.push(await boot());
		}
		expect(reports.every((report) => report.status === 'READY')).toBe(true);

		const db = database.handle();
		if (db === undefined) throw new Error('database not opened');
		expect(countRows(db, 'work_units')).toBe(1);
		expect(countRows(db, 'generations')).toBe(1);
		expect(countRows(db, 'pull_requests')).toBe(1);
		expect(countRows(db, 'ci_runs')).toBe(1);
		// Five boots, five audit rows — the audit trail is SUPPOSED to
		// grow — but the reconstructed model is not.
		expect(countRows(db, 'work_reconciliation_runs')).toBe(5);

		// Only the first boot rebuilt anything.
		const first = reports[0];
		expect(first?.counters.workUnitsRebuilt).toBe(1);
		for (const report of reports.slice(1)) {
			expect(report.counters.workUnitsRebuilt).toBe(0);
			expect(report.counters.journalEventsImported).toBe(0);
		}
	});

	it('takes the incremental path once the machine is warm', async () => {
		const cold = await boot();
		expect(cold.mode).toBe('full');
		expect(cold.counters.refsExamined).toBe(1);
		expect(cold.counters.refsSkippedUnchanged).toBe(0);

		const warm = await boot();
		expect(warm.mode).toBe('incremental');
		expect(warm.counters.refsExamined).toBe(0);
		expect(warm.counters.refsSkippedUnchanged).toBe(1);

		const warmer = await boot();
		expect(warmer.mode).toBe('incremental');
		expect(warmer.counters.refsExamined).toBe(0);
		// Nothing changed, so no cache is stale and no forge payload is
		// downloaded: the conditional read answered "not modified".
		expect(warmer.counters.projectionsRebuilt).toBe(0);
		expect(forge.conditionalHits()).toBeGreaterThan(0);

		const db = database.handle();
		if (db === undefined) throw new Error('database not opened');
		const journalAfterWarmer = countRows(db, 'coordination_journal');
		await boot();
		// A boot that concluded nothing new appends no fingerprint event.
		expect(countRows(db, 'coordination_journal')).toBe(journalAfterWarmer);
	});

	it('re-reads a ref that actually moved, even on the warm path', async () => {
		await boot();
		const laptop = origin.clone('laptop-2');
		laptop.git('fetch', 'origin', `${WORK_REF}:${WORK_REF}`);
		laptop.write('src/alpha.ts', 'export const alpha = 3;\n');
		const second = await laptop.checkpoint({
			ref: WORK_REF,
			paths: ['src/alpha.ts'],
			message: 'wip: alpha again',
		});
		laptop.push(`+${WORK_REF}:${WORK_REF}`);

		const report = await boot();
		expect(report.mode).toBe('incremental');
		expect(report.counters.refsExamined).toBe(1);
		expect(report.counters.refsSkippedUnchanged).toBe(0);
		const db = database.handle();
		if (db === undefined) throw new Error('database not opened');
		expect(countRows(db, 'generations')).toBe(1);
		const row = db.prepare('SELECT wip_head_sha FROM generations').get();
		expect(row?.wip_head_sha).toBe(second);
	});
});

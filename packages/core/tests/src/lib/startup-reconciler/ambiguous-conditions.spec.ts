/**
 * ambiguous-conditions.spec.ts — what the boot does when it does NOT
 * know the answer.
 *
 * Each case here is one the naive "self-healing startup" gets wrong by
 * doing something: deleting the second of two refs that claim the same
 * generation, resetting a moved HEAD, creating a database when the caller
 * asked for a diagnosis. The assertions are therefore about ABSENCE as
 * much as about the report: the refs are still there afterwards, HEAD is
 * where it was, and no file appeared on disk.
 */

import { existsSync } from 'node:fs';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
	createStartupMutex,
	reconcileStartup,
} from '@delendai/core/lib/startup-reconciler/index';

import { environmentSeam, testClock, testPolicy } from './fakes';
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
const REF_A = `refs/${testPolicy().branches.workRefPrefix}agent-a/f1-s1-g1`;
const REF_B = `refs/${testPolicy().branches.workRefPrefix}agent-b/f1-s1-g1`;

const bootAgainst = async (
	office: IStartupClone,
	database: ReturnType<typeof createTestStateDatabase>,
	options?: { readonly allowCreate?: boolean },
) => {
	const clock = testClock();
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
		...(options?.allowCreate === undefined
			? {}
			: { allowCreate: options.allowCreate }),
	});
};

describe('startup refuses to improvise', () => {
	let origin: IStartupOrigin;
	let office: IStartupClone;

	beforeEach(() => {
		origin = createStartupOrigin();
	});

	afterEach(() => {
		origin.cleanup();
	});

	it('degrades on two refs claiming one generation, and deletes neither', async () => {
		const laptop = origin.clone('laptop');
		laptop.write('src/alpha.ts', 'export const alpha = 2;\n');
		const shaA = await laptop.checkpoint({
			ref: REF_A,
			paths: ['src/alpha.ts'],
			message: 'wip a',
		});
		laptop.write('src/beta.ts', 'export const beta = 2;\n');
		const shaB = await laptop.checkpoint({
			ref: REF_B,
			paths: ['src/beta.ts'],
			message: 'wip b',
		});
		laptop.push(`${REF_A}:${REF_A}`, `${REF_B}:${REF_B}`);
		office = origin.clone('office');
		const database = createTestStateDatabase({
			path: join(office.dir, '.delendai', 'state', 'work.sqlite'),
		});

		const report = await bootAgainst(office, database);

		expect(report.status).toBe('DEGRADED');
		expect(report.blockers.map((item) => item.code)).toContain(
			'work-refs.duplicate-generation',
		);
		expect(report.recoveryRequired).toBe(true);
		expect(report.mutationsBlocked).toBe(true);

		const task = report.repairTasks.find(
			(item) => item.code === 'work-refs.duplicate-generation',
		);
		expect(task).toBeDefined();
		expect(task?.subject).toBe([REF_A, REF_B].sort().join(' + '));
		expect(task?.suggestedActions.join(' ')).toContain('Never delete');

		// Nothing invented locally...
		const db = database.handle();
		if (db === undefined) throw new Error('database not opened');
		expect(countRows(db, 'work_units')).toBe(0);
		expect(countRows(db, 'generations')).toBe(0);
		// ...and nothing deleted in git.
		expect(office.git('rev-parse', REF_A)).toBe(shaA);
		expect(office.git('rev-parse', REF_B)).toBe(shaB);

		// The same ambiguity on the next boot yields the SAME task id.
		const again = await bootAgainst(office, database);
		expect(again.repairTasks.map((item) => item.id)).toEqual(
			report.repairTasks.map((item) => item.id),
		);
		database.close();
	});

	it('reports HEAD moved onto a work ref without resetting anything', async () => {
		const laptop = origin.clone('laptop');
		laptop.write('src/alpha.ts', 'export const alpha = 2;\n');
		const sha = await laptop.checkpoint({
			ref: REF_A,
			paths: ['src/alpha.ts'],
			message: 'wip a',
		});
		laptop.push(`${REF_A}:${REF_A}`);
		office = origin.clone('office');
		const database = createTestStateDatabase({
			path: join(office.dir, '.delendai', 'state', 'work.sqlite'),
		});
		office.git('fetch', 'origin', `${REF_A}:${REF_A}`);
		office.git('checkout', '--quiet', '--detach', sha);
		const headBefore = office.git('rev-parse', 'HEAD');

		const report = await bootAgainst(office, database);

		expect(report.status).toBe('DEGRADED');
		const blocker = report.blockers.find(
			(item) => item.code === 'checkout.head-moved',
		);
		expect(blocker).toBeDefined();
		expect(blocker?.subject).toBe(REF_A);
		expect(blocker?.message).toContain('Nothing was reset');
		// HEAD is exactly where the user left it.
		expect(office.git('rev-parse', 'HEAD')).toBe(headBefore);
		database.close();
	});

	it('diagnoses an absent database instead of failing to open a file', async () => {
		office = origin.clone('office');
		const dbPath = join(office.dir, '.delendai', 'state', 'work.sqlite');
		const database = createTestStateDatabase({ path: dbPath });

		const report = await bootAgainst(office, database, {
			allowCreate: false,
		});

		expect(report.status).toBe('DEGRADED');
		const blocker = report.blockers.find(
			(item) => item.code === 'state-database.absent',
		);
		expect(blocker).toBeDefined();
		expect(blocker?.message).toContain('database absent / not initialized');
		expect(blocker?.message).not.toContain('unable to open database file');
		// A diagnosis creates nothing.
		expect(existsSync(dbPath)).toBe(false);
		expect(database.handle()).toBeUndefined();
	});

	it('does not let two concurrent starts reconcile at once', async () => {
		office = origin.clone('office');
		const database = createTestStateDatabase({
			path: join(office.dir, '.delendai', 'state', 'work.sqlite'),
		});
		const clock = testClock();
		const lockPath = join(office.dir, '.delendai', 'startup.lock');
		const holder = createStartupMutex({
			path: lockPath,
			machineId: 'office',
			clock,
			pid: 4242,
		});
		const held = await holder.acquire();
		expect(held.kind).toBe('acquired');

		const report = await bootAgainst(office, database);

		expect(report.status).toBe('DEGRADED');
		expect(report.mode).toBe('skipped');
		expect(report.blockers.map((item) => item.code)).toEqual([
			'mutex.busy',
		]);
		// The second boot never touched the database.
		expect(database.handle()).toBeUndefined();
		if (held.kind === 'acquired') await held.release();
	});
});

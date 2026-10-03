/**
 * work-after-integration.spec.ts — a ref that moved on from an
 * integrated checkpoint does not stop the boot (x00685).
 *
 * A unit entered at the integration tip, before its first commit, is
 * already contained in the integration branch, so the boot records it
 * as integrated. When the agent then commits on the same ref, the next
 * boot tried to record that work over the integrated row, the schema
 * refused it, and the host server exited: one agent's branch stopped
 * the server for every agent on the machine.
 */
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
	createStartupMutex,
	reconcileStartup,
} from '@delendai/core/lib/startup-reconciler/index';

import { environmentSeam, testClock, testPolicy } from './fakes';
import { createTestStateDatabase } from './sqlite-state';
import {
	createStartupOrigin,
	type IStartupClone,
	type IStartupOrigin,
} from './startup-workspace';

const REF = `refs/${testPolicy().branches.workRefPrefix}agent-a/f1-s1-g1`;

const boot = (
	office: IStartupClone,
	database: ReturnType<typeof createTestStateDatabase>,
) => {
	const clock = testClock();
	return reconcileStartup({
		mutexWait: {
			timeoutMs: 0,
			pollMs: 5,
			sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
		},
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

describe('a ref that moved on from an integrated checkpoint', () => {
	let origin: IStartupOrigin;

	beforeEach(() => {
		origin = createStartupOrigin();
	});

	afterEach(() => {
		origin.cleanup();
	});

	it('is reported, keeps the integrated record, and the boot completes', async () => {
		const laptop = origin.clone('laptop');
		// Entered at the integration tip: no commit of its own yet.
		laptop.push(`HEAD:${REF}`);
		const office = origin.clone('office');
		const database = createTestStateDatabase({
			path: join(office.dir, '.delendai', 'state', 'work.sqlite'),
		});
		await boot(office, database);

		laptop.git('fetch', '--quiet', 'origin', `${REF}:${REF}`);
		laptop.write('src/alpha.ts', 'export const alpha = 2;\n');
		const moved = await laptop.checkpoint({
			ref: REF,
			paths: ['src/alpha.ts'],
			message: 'wip after entering',
		});
		laptop.push(`${REF}:${REF}`);

		const report = await boot(office, database);

		const note = report.findings.find(
			(item) => item.code === 'work-refs.work-after-integration',
		);
		expect(note?.kind).toBe('note');
		expect(note?.message).toContain('g2');
		expect(report.blockers).toEqual([]);
		const db = database.handle();
		if (db === undefined) throw new Error('database not opened');
		const row = db
			.prepare(
				'SELECT wip_head_sha, integrated_sha, checkpoint_kind FROM generations',
			)
			.get();
		expect(row?.integrated_sha).not.toBeNull();
		expect(row?.checkpoint_kind).toBe('merge-candidate');
		expect(row?.wip_head_sha).not.toBe(moved);
	});

	it('reports a checkpoint the database refuses, and the boot still returns', async () => {
		const laptop = origin.clone('laptop');
		const office = origin.clone('office');
		const database = createTestStateDatabase({
			path: join(office.dir, '.delendai', 'state', 'work.sqlite'),
		});
		await boot(office, database);
		const db = database.handle();
		if (db === undefined) throw new Error('database not opened');
		db.exec(
			"CREATE TRIGGER refuse BEFORE INSERT ON generations BEGIN SELECT RAISE(ABORT, 'refused by the test'); END",
		);
		laptop.write('src/beta.ts', 'export const beta = 2;\n');
		await laptop.checkpoint({
			ref: REF,
			paths: ['src/beta.ts'],
			message: 'wip',
		});
		laptop.push(`${REF}:${REF}`);

		const report = await boot(office, database);

		const failed = report.blockers.find(
			(item) => item.code === 'work-refs.record-failed',
		);
		expect(failed?.message).toContain('refused by the test');
	});
});

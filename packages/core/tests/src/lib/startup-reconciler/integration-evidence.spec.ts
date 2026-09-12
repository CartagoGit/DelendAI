/**
 * integration-evidence.spec.ts — cleanup only ever follows PROOF.
 *
 * A work ref that is gone is either the happy ending (it merged, and the
 * remote deleted it) or the disaster (something removed unmerged work).
 * The reconciler is allowed to record the first and forbidden to assume
 * it, so both are exercised here against a real repository where the
 * merge really happened — or really did not.
 *
 * The third case is the ref that matches no identity at all: it is
 * reported, never adopted, and never deleted.
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
	INTEGRATION_BRANCH,
	type IStartupClone,
	type IStartupOrigin,
} from './startup-workspace';

const REF = 'refs/wip/agent-a/f1-s1-g1';

describe('integration evidence', () => {
	let origin: IStartupOrigin;
	let laptop: IStartupClone;
	let office: IStartupClone;
	let database: ReturnType<typeof createTestStateDatabase>;
	let wipSha: string;

	const boot = async () => {
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
		});
	};

	beforeEach(async () => {
		origin = createStartupOrigin();
		laptop = origin.clone('laptop');
		laptop.write('src/alpha.ts', 'export const alpha = 2;\n');
		wipSha = await laptop.checkpoint({
			ref: REF,
			paths: ['src/alpha.ts'],
			message: 'wip a',
		});
		laptop.push(`${REF}:${REF}`);
		office = origin.clone('office');
		database = createTestStateDatabase({
			path: join(office.dir, '.delendai', 'state', 'work.sqlite'),
		});
	});

	afterEach(() => {
		database.close();
		origin.cleanup();
	});

	it('records a checkpoint whose ref was deleted because it merged', async () => {
		const first = await boot();
		expect(first.status).toBe('READY');

		// The work merges (from a clean checkout, as the forge would),
		// and the merged work ref is deleted on the remote.
		const integrator = origin.clone('integrator');
		integrator.git('fetch', 'origin', `${REF}:${REF}`);
		integrator.git('merge', '--no-ff', '--no-edit', '--quiet', wipSha);
		integrator.push(INTEGRATION_BRANCH);
		integrator.git('push', '--quiet', 'origin', `:${REF}`);

		const second = await boot();
		expect(second.blockers.map((item) => item.code)).toEqual([]);
		expect(second.status).toBe('READY');
		expect(second.findings.map((item) => item.code)).toContain(
			'integration-evidence.merged-ref-absent',
		);
		expect(second.counters.generationsIntegrated).toBe(1);

		const db = database.handle();
		if (db === undefined) throw new Error('database not opened');
		const row = db
			.prepare('SELECT integrated_sha, candidate_state FROM generations')
			.get();
		expect(row?.candidate_state).toBe('integrated');
		expect(typeof row?.integrated_sha).toBe('string');
	});

	it('degrades when a ref vanishes with no proof that it merged', async () => {
		expect((await boot()).status).toBe('READY');

		// Deleted without merging: the checkpoint exists nowhere else.
		laptop.git('push', '--quiet', 'origin', `:${REF}`);

		const report = await boot();
		expect(report.status).toBe('DEGRADED');
		const blocker = report.blockers.find(
			(item) => item.code === 'integration-evidence.ref-vanished',
		);
		expect(blocker).toBeDefined();
		expect(blocker?.subject).toBe(REF);

		// The row that remembers the lost work is still there.
		const db = database.handle();
		if (db === undefined) throw new Error('database not opened');
		const row = db
			.prepare('SELECT wip_head_sha, integrated_sha FROM generations')
			.get();
		expect(row?.wip_head_sha).toBe(wipSha);
		expect(row?.integrated_sha).toBeNull();
	});

	it('refuses to attribute a ref that matches no work identity', async () => {
		laptop.git('update-ref', 'refs/wip/mystery', wipSha);
		laptop.push('refs/wip/mystery:refs/wip/mystery');

		const report = await boot();
		expect(report.status).toBe('DEGRADED');
		const blocker = report.blockers.find(
			(item) => item.code === 'work-refs.unattributable',
		);
		expect(blocker).toBeDefined();
		expect(blocker?.subject).toBe('refs/wip/mystery');
		expect(report.repairTasks.some((task) => task.blocksMutation)).toBe(
			true,
		);
		// The mystery ref is still on the machine, untouched.
		expect(office.git('rev-parse', 'refs/wip/mystery')).toBe(wipSha);
	});
});

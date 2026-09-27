/**
 * A swarm does not degrade the boot (x00702).
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

const WORK = `refs/${testPolicy().branches.workRefPrefix}`;
const PUBLICATION = `refs/heads/${testPolicy().branches.publicationRefPrefix}`;

describe('a swarm does not degrade the boot (x00702)', () => {
	let origin: IStartupOrigin;

	beforeEach(() => {
		origin = createStartupOrigin();
	});

	afterEach(() => {
		origin.cleanup();
	});

	it("does not call a published unit's work ref vanished", async () => {
		const ref = `${WORK}agent-a/implement/f1-s1-g1/work`;
		const laptop = origin.clone('laptop');
		laptop.write('src/alpha.ts', 'export const alpha = 2;\n');
		const sha = await laptop.checkpoint({
			ref,
			paths: ['src/alpha.ts'],
			message: 'wip',
		});
		laptop.push(`${ref}:${ref}`);
		const office = origin.clone('office');
		const database = createTestStateDatabase({
			path: join(office.dir, '.delendai', 'state', 'work.sqlite'),
		});
		await boot(office, database);

		// `work publish`: the work moves to its publication, the work ref goes.
		const publication = `${PUBLICATION}agent-a/implement/f1-s1-g1/work`;
		laptop.push(`${sha}:${publication}`, `:${ref}`);
		const report = await boot(office, database);

		expect(report.blockers.map((item) => item.code)).not.toContain(
			'integration-evidence.ref-vanished',
		);
		expect(report.findings.map((item) => item.code)).toContain(
			'integration-evidence.checkpoint-published',
		);
	});

	it("treats two agents' review batches as two units, not a duplicate", async () => {
		const laptop = origin.clone('laptop');
		for (const agent of ['glm-5', 'minimax-m3']) {
			const ref = `${WORK}${agent}/review/batch-all-g1/close`;
			laptop.write(`src/${agent}.ts`, `export const x = '${agent}';\n`);
			await laptop.checkpoint({
				ref,
				paths: [`src/${agent}.ts`],
				message: `review by ${agent}`,
			});
			laptop.push(`${ref}:${ref}`);
		}
		const office = origin.clone('office');
		const database = createTestStateDatabase({
			path: join(office.dir, '.delendai', 'state', 'work.sqlite'),
		});
		const report = await boot(office, database);

		expect(report.blockers.map((item) => item.code)).not.toContain(
			'work-refs.duplicate-generation',
		);
	});
});

/**
 * A swarm does not degrade the boot (x00702).
 */
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
	createStartupMutex,
	reconcileStartup,
} from '@delendai/core/lib/startup-reconciler/index';

import { namespacedRef } from '@delendai/core/lib/work-units/namespaced-ref.helper';

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

	it('does not call a retired unit lost while the forge keeps its tip, nor once it is dropped', async () => {
		const ref = `${WORK}agent-a/implement/f1-s2-g1/given-up`;
		const laptop = origin.clone('laptop');
		laptop.write('src/beta.ts', 'export const beta = 2;\n');
		const sha = await laptop.checkpoint({
			ref,
			paths: ['src/beta.ts'],
			message: 'wip',
		});
		laptop.push(`${ref}:${ref}`);
		const office = origin.clone('office');
		const database = createTestStateDatabase({
			path: join(office.dir, '.delendai', 'state', 'work.sqlite'),
		});
		await boot(office, database);

		// `work retire`: the tip is kept on the forge, the work ref goes.
		const retired = namespacedRef(
			testPolicy().branches.namespacePrefix,
			'retired',
			'agent-a/implement/f1-s2-g1/given-up',
		);
		laptop.push(`${sha}:${retired}`, `:${ref}`);
		const kept = await boot(office, database);

		expect(kept.blockers.map((item) => item.code)).not.toContain(
			'integration-evidence.ref-vanished',
		);
		expect(kept.findings.map((item) => item.code)).toContain(
			'integration-evidence.checkpoint-retired',
		);

		// Dropped as well (`work retired --drop`, or landed): dropping is
		// the decision, and this clone saw it retired, so nothing is lost.
		laptop.push(`:${retired}`);
		const dropped = await boot(office, database);
		expect(dropped.blockers.map((item) => item.code)).not.toContain(
			'integration-evidence.ref-vanished',
		);
		expect(dropped.findings.map((item) => item.code)).toContain(
			'integration-evidence.checkpoint-retired',
		);
	});

	it('still asks about a checkpoint dropped before this clone ever saw it retired', async () => {
		const ref = `${WORK}agent-a/implement/f1-s3-g1/never-seen`;
		const laptop = origin.clone('laptop');
		laptop.write('src/gamma.ts', 'export const gamma = 3;\n');
		await laptop.checkpoint({
			ref,
			paths: ['src/gamma.ts'],
			message: 'wip',
		});
		laptop.push(`${ref}:${ref}`);
		const office = origin.clone('office');
		const database = createTestStateDatabase({
			path: join(office.dir, '.delendai', 'state', 'work.sqlite'),
		});
		await boot(office, database);

		laptop.push(`:${ref}`);
		const gone = await boot(office, database);
		expect(gone.blockers.map((item) => item.code)).toContain(
			'integration-evidence.ref-vanished',
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

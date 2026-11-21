/**
 * A machine without the forge's CLI starts READY: what it cannot read is
 * noted with how to read it, while a forge that is installed and fails
 * still blocks.
 */
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { forgeCliMissing } from '@delendai/core/lib/startup-reconciler/forge-cli-missing.helper';
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

describe('a forge that cannot be read', () => {
	let origin: IStartupOrigin;
	let office: IStartupClone;
	beforeEach(() => {
		origin = createStartupOrigin();
		office = origin.clone('office');
	});
	afterEach(() => origin.cleanup());

	const reconcileWith = (reason: string) => {
		const clock = testClock();
		return reconcileStartup({
			policy: testPolicy(),
			environmentSeam: environmentSeam({
				workspaceRoot: office.dir,
				machineId: 'office',
				agentId: 'agent-office',
			}),
			database: createTestStateDatabase({
				path: join(office.dir, '.delendai', 'state', 'work.sqlite'),
			}),
			git: office.seam,
			mutex: createStartupMutex({
				path: join(office.dir, '.delendai', 'startup.lock'),
				machineId: 'office',
				clock,
			}),
			clock,
			forge: {
				listPullRequests: async () => ({ kind: 'unavailable', reason }),
				listCheckRuns: async () => ({ kind: 'unavailable', reason }),
			},
		});
	};

	it('is a note, and the start is not degraded, when its CLI is not installed', async () => {
		const report = await reconcileWith(
			'the forge CLI could not run (Executable not found in $PATH: "gh")',
		);
		expect(report.blockers.map((item) => item.code)).not.toContain(
			'forge.unavailable',
		);
		expect(report.status).not.toBe('DEGRADED');
	});

	it('still blocks when the CLI is there and fails', async () => {
		const report = await reconcileWith('HTTP 401: Bad credentials');
		expect(report.blockers.map((item) => item.code)).toContain(
			'forge.unavailable',
		);
	});

	it('tells a missing tool from a failing one', () => {
		expect(forgeCliMissing('Executable not found in $PATH: "gh"')).toBe(
			true,
		);
		expect(forgeCliMissing('spawn gh ENOENT')).toBe(true);
		expect(forgeCliMissing('HTTP 401: Bad credentials')).toBe(false);
	});
});

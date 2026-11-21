import { DEFAULT_INTEGRATION_OPTIONS } from '@delendai/core/cli';
import { describe, expect, it } from 'vitest';

import { fakePartial } from '@delendai/test-kit';

import type { IRehearsalForge } from '../../../../src/lib/contracts/interfaces/rehearsal.interface';

import type { IRehearsalRun } from '../../../../src/lib/contracts/interfaces/rehearsal.interface';
import {
	cleanRun,
	newRunId,
	runStartOf,
	secretHitsIn,
	sweepStaleRuns,
} from '../../../../src/lib/services/rehearsal-cleanup.service';
import {
	renderRehearsalCiWorkflow,
	renderRehearsalScanWorkflow,
	renderRehearsalTokenWorkflow,
} from '../../../../src/lib/services/rehearsal-ci-workflow.helper';
import { REHEARSAL_CLEANUP_WAIT_SECONDS } from '../../../../src/lib/contracts/constants/rehearsal.constant';
import { runLabelPrefix } from '../../../../src/lib/services/rehearsal-names.helper';
import {
	createRehearsalSetup,
	landIntegratorWorkflow,
} from '../../../../src/lib/services/rehearsal-setup.helper';

/** A forge that knows only its branches: all the cleanup reads. */
const branchesForge = (names: Map<string, string>) =>
	fakePartial<IRehearsalForge>({
		listBranches: async (prefix: string) =>
			[...names.keys()].filter((b) => b.startsWith(prefix)),
		deleteBranch: async (name: string) => void names.delete(name),
		runs: async () => [],
		cancelRun: async () => 'cancelled' as const,
		pulls: async () => [],
		closePull: async () => undefined,
		labels: async () => [],
		deleteLabel: async () => undefined,
	});

/** A clock that never sleeps: waiting advances it. */
const stepClock = () => {
	let at = Date.parse('2026-11-12T10:00:00Z');
	return {
		now: () => at,
		wait: async (ms: number) => {
			at += ms;
		},
	};
};

const runWith = (id: number, status: string): IRehearsalRun => ({
	id,
	workflow: 'land',
	event: 'workflow_dispatch',
	headBranch: 'b',
	headSha: 's',
	status,
	actor: 'a',
	createdAt: '',
	updatedAt: '',
});

describe('cleanup and setup', () => {
	it('[<50ms] reads the start of a run from its id and refuses other names', () => {
		const id = newRunId(Date.parse('2026-11-12T10:00:00Z'));
		expect(id).toBe('r20261112-100000');
		expect(runStartOf(id)).toBe(Date.parse('2026-11-12T10:00:00Z'));
		expect(runStartOf('nope')).toBeUndefined();
	});

	it('[<50ms] names the group in the id of a run that plays one, and still reads its start', () => {
		const id = newRunId(Date.parse('2026-11-12T10:00:00Z'), 2);
		expect(id).toBe('r20261112-100000-g2');
		expect(runStartOf(id)).toBe(Date.parse('2026-11-12T10:00:00Z'));
	});

	it('[<100ms] sweeps the roots of its own group and the stale ones, never a sibling group', async () => {
		const branches = new Map<string, string>();
		branches.set('ns/rehearsal/r20261112-095900-g1/x-integration', 's');
		branches.set('ns/rehearsal/r20261112-095900-g2/y-integration', 's');
		branches.set('ns/rehearsal/r20261112-060000-g3/z-integration', 's');
		const swept = await sweepStaleRuns({
			forge: branchesForge(branches),
			clock: stepClock(),
			branchPrefix: 'ns/rehearsal/',
			now: Date.parse('2026-11-12T10:00:00Z'),
			ownGroup: 1,
		});
		expect([...swept].sort()).toEqual([
			'r20261112-060000-g3',
			'r20261112-095900-g1',
		]);
		expect([...branches.keys()]).toEqual([
			'ns/rehearsal/r20261112-095900-g2/y-integration',
		]);
	});

	it('[<100ms] sweeps runs older than the stale age and keeps a fresh one', async () => {
		const branches = new Map<string, string>();
		const forge = branchesForge(branches);
		branches.set('ns/rehearsal/r20261112-060000/x-integration', 's');
		branches.set('ns/rehearsal/r20261112-095900/y-integration', 's');
		const swept = await sweepStaleRuns({
			forge,
			clock: stepClock(),
			branchPrefix: 'ns/rehearsal/',
			now: Date.parse('2026-11-12T10:00:00Z'),
		});
		expect(swept).toEqual(['r20261112-060000']);
		expect([...branches.keys()].some((b) => b.includes('095900'))).toBe(
			true,
		);
	});

	it('[<50ms] finds a token shape and a secret value in a log, and nothing in a clean one', () => {
		const run = { id: 4, workflow: 'w' };
		const shaped = `ghp_${'a'.repeat(36)}`;
		expect(secretHitsIn(run, `ok\nleak ${shaped}`)).toHaveLength(1);
		expect(
			secretHitsIn(run, 'has hunter2hunter2 inside', ['hunter2hunter2']),
		).toHaveLength(1);
		expect(secretHitsIn(run, 'nothing here')).toEqual([]);
	});

	it('[<50ms] renders the workflows with the event values reaching the shell through env only', () => {
		const ci = renderRehearsalCiWorkflow({
			integration: 'ns/i',
			runId: 'r1',
		});
		expect(ci).toContain("branches: ['ns/i']");
		expect(ci).not.toMatch(/run:.*\$\{\{/u);
		expect(renderRehearsalScanWorkflow({ integration: 'ns/i' })).toContain(
			'rehearsal-scan',
		);
		const token = renderRehearsalTokenWorkflow({
			integration: 'ns/i',
			labelPrefix: runLabelPrefix('r1'),
			branchPrefix: 'ns/rehearsal/',
		});
		expect(token).toContain('github.token');
	});

	it('[<100ms] makes the setup commit of workflows, policy and run marker', async () => {
		const setup = createRehearsalSetup({
			runId: 'r1',
			branchPrefix: 'ns/rehearsal/',
			policyText: '{"development":{}}',
			integratorWorkflow: (integration, group) =>
				landIntegratorWorkflow(integration, group, {
					releaseBranch: 'main',
					passCommand: 'bun pass',
					identity: DEFAULT_INTEGRATION_OPTIONS.identity,
				}),
		});
		const paths = (await setup.files('ns/rehearsal/r1/s-integration')).map(
			(f) => f.path,
		);
		expect(paths).toContain('.github/workflows/land.yml');
		expect(
			(await setup.files('i')).find((f) => f.path.endsWith('land.yml'))
				?.content,
		).toContain('group: land-rehearsal-r1');
		expect(paths).toContain('delendai.config.json');
		expect(paths).toContain('rehearsal/r1/.keep');
		// The token workflow opens its branch under the run's own root, where the harness and cleanup look.
		expect(
			(await setup.files('i')).find((f) =>
				f.path.endsWith('rehearsal-token.yml'),
			)?.content,
		).toContain('BRANCH_PREFIX: ns/rehearsal/r1/');
	});

	it("[<100ms] sweeps a root of any age when told, as the workflow's last step does", async () => {
		const branches = new Map<string, string>();
		branches.set('ns/rehearsal/r20261112-095900/y-integration', 's');
		const swept = await sweepStaleRuns({
			forge: branchesForge(branches),
			clock: stepClock(),
			branchPrefix: 'ns/rehearsal/',
			now: Date.parse('2026-11-12T10:00:00Z'),
			olderThanMs: 0,
		});
		expect(swept).toEqual(['r20261112-095900']);
		expect(branches.size).toBe(0);
	});

	it('[<100ms] cancels a queued land run and deletes the branch only after it is gone', async () => {
		const branches = new Map([['ns/rehearsal/r1/s-integration', 's']]);
		const order: string[] = [];
		let queued = true;
		const forge = fakePartial<IRehearsalForge>({
			...branchesForge(branches),
			runs: async () => (queued ? [runWith(9, 'queued')] : []),
			cancelRun: async (id: number) => {
				order.push(`cancel ${String(id)}`);
				queued = false;
				return 'cancelled' as const;
			},
			deleteBranch: async (name: string) => {
				order.push('delete');
				branches.delete(name);
			},
		});
		const { leftovers } = await cleanRun({
			forge,
			clock: stepClock(),
			branchPrefix: 'ns/rehearsal/',
			runId: 'r1',
		});
		expect(order).toEqual(['cancel 9', 'delete']);
		expect(leftovers).toEqual([]);
	});

	it('[<100ms] waits for a run in progress and never cancels it', async () => {
		const branches = new Map([['ns/rehearsal/r1/s-integration', 's']]);
		const clock = stepClock();
		const started = clock.now();
		let polls = 0;
		const order: string[] = [];
		const forge = fakePartial<IRehearsalForge>({
			...branchesForge(branches),
			runs: async () => (++polls < 3 ? [runWith(4, 'in_progress')] : []),
			cancelRun: async () => {
				order.push('cancel');
				return 'cancelled' as const;
			},
			deleteBranch: async () => void order.push('delete'),
		});
		await cleanRun({
			forge,
			clock,
			branchPrefix: 'ns/rehearsal/',
			runId: 'r1',
		});
		expect(order).toEqual(['delete']);
		expect(clock.now()).toBeGreaterThan(started);
	});

	it('[<100ms] stops waiting at the cap and says which run was still in progress', async () => {
		const branches = new Map([['ns/rehearsal/r1/s-integration', 's']]);
		const forge = fakePartial<IRehearsalForge>({
			...branchesForge(branches),
			runs: async () => [runWith(4, 'in_progress')],
		});
		const clock = stepClock();
		const started = clock.now();
		const { leftovers } = await cleanRun({
			forge,
			clock,
			branchPrefix: 'ns/rehearsal/',
			runId: 'r1',
		});
		expect(leftovers[0]).toContain('run 4 (land) still in progress');
		expect(clock.now() - started).toBeLessThanOrEqual(
			(REHEARSAL_CLEANUP_WAIT_SECONDS + 15) * 1000,
		);
	});

	it('[<100ms] records a queued run the forge never enqueued, instead of hiding its 409', async () => {
		const branches = new Map([['ns/rehearsal/r1/s-integration', 's']]);
		const forge = fakePartial<IRehearsalForge>({
			...branchesForge(branches),
			runs: async () => [
				{ ...runWith(4, 'queued'), createdAt: '2026-11-16T10:00:00Z' },
				{
					...runWith(5, 'completed'),
					createdAt: '2026-11-16T10:00:09Z',
				},
			],
			cancelRun: async () => 'unstarted' as const,
		});
		const cleaned = await cleanRun({
			forge,
			clock: stepClock(),
			branchPrefix: 'ns/rehearsal/',
			runId: 'r1',
		});
		expect(cleaned.leftovers).toEqual([]);
		expect(cleaned.unstarted).toEqual([
			{ id: 4, workflow: 'land', branch: 'b', lost: true },
		]);
	});
});

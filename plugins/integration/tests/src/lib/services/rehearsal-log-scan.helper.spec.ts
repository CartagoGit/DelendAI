import { fakePartial } from '@delendai/test-kit';
import { describe, expect, it } from 'vitest';

import {
	REHEARSAL_SCAN_WAIT_CAP_SECONDS,
	REHEARSAL_POLL_MS,
} from '../../../../src/lib/contracts/constants/rehearsal.constant';
import type {
	IRehearsalCancel,
	IRehearsalEvidence,
	IRehearsalRun,
} from '../../../../src/lib/contracts/interfaces/rehearsal.interface';
import { scanLogs } from '../../../../src/lib/services/rehearsal-log-scan.helper';

const TOKEN = `ghp_${'a'.repeat(36)}`;

const runOf = (id: number, status: string): IRehearsalRun =>
	fakePartial<IRehearsalRun>({
		id,
		status,
		workflow: 'CI',
		headBranch: 'b',
	});

const evidence = fakePartial<IRehearsalEvidence>({
	integration: 'b',
	pulls: {},
	runs: [runOf(1, 'in_progress')],
});

const ports = (
	runsAt: (now: number) => IRehearsalRun[],
	log = 'clean',
	jobs = 1,
	cancel: IRehearsalCancel = 'cancelled',
) => {
	const state = {
		now: 0,
		logReadAt: [] as number[],
		cancelled: [] as number[],
	};
	return {
		state,
		ports: {
			branchRoot: 'ns/',
			clock: {
				now: () => state.now,
				wait: async (ms: number) => {
					state.now += ms;
				},
			},
			forge: {
				runs: async () => runsAt(state.now),
				jobCount: async () => jobs,
				cancelRun: async (id: number) => {
					state.cancelled.push(id);
					return cancel;
				},
				runLog: async () => {
					state.logReadAt.push(state.now);
					return log;
				},
			},
		},
	};
};

describe('the secret scan of a scenario', () => {
	it('[<20ms] reads no log until every run concluded, however long that takes', async () => {
		const done = 2 * 60_000;
		const { ports: p, state } = ports((now) => [
			runOf(1, now < done ? 'in_progress' : 'completed'),
		]);
		const scan = await scanLogs(p, [evidence]);
		expect(scan).toEqual({ hits: [], unread: [], unstarted: [] });
		expect(state.logReadAt).toEqual([done]);
		expect(done % REHEARSAL_POLL_MS).toBe(0);
	});

	it('[<20ms] reports a run still open at the cap as not measured with its id, and reads nothing of it', async () => {
		const { ports: p, state } = ports(
			() => [runOf(1, 'queued')],
			'clean',
			3,
		);
		const scan = await scanLogs(p, [evidence]);
		expect(scan.hits).toEqual([]);
		expect(scan.unread).toEqual([
			`CI run 1: not concluded within the ${String(REHEARSAL_SCAN_WAIT_CAP_SECONDS)} s cap`,
		]);
		expect(state.logReadAt).toEqual([]);
	});

	it('[<20ms] finds a token shape in a concluded run, with the run it came from', async () => {
		const { ports: p } = ports(() => [runOf(1, 'completed')], TOKEN);
		const scan = await scanLogs(p, [evidence]);
		expect(scan.unread).toEqual([]);
		expect(scan.hits).toEqual(['CI run 1 line 1']);
	});

	it('[<20ms] names a concluded run whose log cannot be read, neither a hit nor a pass', async () => {
		const { ports: p } = ports(() => [runOf(1, 'completed')]);
		const broken = {
			...p,
			forge: {
				...p.forge,
				runLog: async () => {
					throw new Error('expired');
				},
			},
		};
		expect(await scanLogs(broken, [evidence])).toEqual({
			hits: [],
			unread: ['CI run 1: expired'],
			unstarted: [],
		});
	});

	it('[<20ms] waits for an older run of the same workflow and commit that is still open behind a newer one, then reads both', async () => {
		const done = 90_000;
		const { ports: p, state } = ports((now) => [
			{
				...runOf(1, now < done ? 'in_progress' : 'completed'),
				createdAt: '1',
			},
			{ ...runOf(2, 'completed'), createdAt: '2' },
		]);
		const scan = await scanLogs(p, [evidence]);
		expect(scan).toEqual({ hits: [], unread: [], unstarted: [] });
		expect(state.logReadAt).toEqual([done, done]);
	});

	it('[<20ms] reports the older run that never concludes within the cap as not measured, and still reads the others', async () => {
		const { ports: p, state } = ports(
			() => [
				{ ...runOf(1, 'queued'), createdAt: '1' },
				{ ...runOf(2, 'completed'), createdAt: '2' },
			],
			'clean',
			2,
		);
		const scan = await scanLogs(p, [evidence]);
		expect(scan.unread).toEqual([
			`CI run 1: not concluded within the ${String(REHEARSAL_SCAN_WAIT_CAP_SECONDS)} s cap`,
		]);
		expect(state.logReadAt).toHaveLength(1);
	});

	it('[<20ms] lists a run queued with no job at the cap as unstarted, not unread, and judges it lost when no pass covers it', async () => {
		const { ports: p, state } = ports(
			() => [
				{ ...runOf(1, 'queued'), createdAt: '1' },
				{ ...runOf(2, 'completed'), createdAt: '2' },
				{ ...runOf(3, 'queued'), createdAt: '3', workflow: 'other' },
			],
			'clean',
			0,
		);
		const scan = await scanLogs(p, [evidence]);
		expect(scan.unread).toEqual([]);
		expect(scan.unstarted).toEqual([
			{ id: 1, workflow: 'CI', branch: 'b', lost: true },
			{ id: 3, workflow: 'other', branch: 'b', lost: true },
		]);
		expect(state.logReadAt).toHaveLength(1);
	});

	const own = (id: number, status: string): IRehearsalRun => ({
		...runOf(id, status),
		headBranch: 'ns/head',
	});

	it('[<20ms] cancels a run of its own in progress, waits for it to complete, then scans its log', async () => {
		let cancelledAt: number | undefined;
		const { ports: p, state } = ports(() => []);
		const world = {
			...p,
			forge: {
				...p.forge,
				runs: async () => [
					own(
						1,
						cancelledAt === undefined ? 'in_progress' : 'completed',
					),
				],
				cancelRun: async (id: number) => {
					state.cancelled.push(id);
					cancelledAt = state.now + REHEARSAL_POLL_MS;
					return 'cancelled' as const;
				},
			},
		};
		const scan = await scanLogs(world, [evidence]);
		expect(state.cancelled).toEqual([1]);
		expect(scan).toEqual({ hits: [], unread: [], unstarted: [] });
		expect(state.logReadAt).toHaveLength(1);
	});

	it('[<20ms] never cancels a run outside the rehearsal branches', async () => {
		const { ports: p, state } = ports(() => [runOf(1, 'in_progress')]);
		await scanLogs(p, [evidence]);
		expect(state.cancelled).toEqual([]);
	});

	it('[<20ms] leaves a run the forge has not queued yet as unstarted', async () => {
		const { ports: p, state } = ports(
			() => [own(1, 'queued')],
			'clean',
			0,
			'unstarted',
		);
		const scan = await scanLogs(p, [evidence]);
		expect(state.cancelled).toEqual([1]);
		expect(scan.unstarted).toHaveLength(1);
		expect(scan.unread).toEqual([]);
	});

	it('[<20ms] keeps a cancelled run whose log cannot be read as not measured', async () => {
		const { ports: p } = ports(() => [own(1, 'completed')]);
		const broken = {
			...p,
			forge: {
				...p.forge,
				runLog: async () => {
					throw new Error('gone');
				},
			},
		};
		expect((await scanLogs(broken, [evidence])).unread).toEqual([
			'CI run 1: gone',
		]);
	});
});

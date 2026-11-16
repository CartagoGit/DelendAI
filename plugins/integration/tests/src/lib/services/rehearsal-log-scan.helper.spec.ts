import { fakePartial } from '@delendai/test-kit';
import { describe, expect, it } from 'vitest';

import {
	REHEARSAL_AWAIT_CAP_SECONDS,
	REHEARSAL_POLL_MS,
} from '../../../../src/lib/contracts/constants/rehearsal.constant';
import type {
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

const ports = (runsAt: (now: number) => IRehearsalRun[], log = 'clean') => {
	const state = { now: 0, logReadAt: [] as number[] };
	return {
		state,
		ports: {
			clock: {
				now: () => state.now,
				wait: async (ms: number) => {
					state.now += ms;
				},
			},
			forge: {
				runs: async () => runsAt(state.now),
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
		const done = 20 * 60_000;
		const { ports: p, state } = ports((now) => [
			runOf(1, now < done ? 'in_progress' : 'completed'),
		]);
		const scan = await scanLogs(p, [evidence]);
		expect(scan).toEqual({ hits: [], unread: [] });
		expect(state.logReadAt).toEqual([done]);
		expect(done % REHEARSAL_POLL_MS).toBe(0);
	});

	it('[<20ms] reports a run still open at the cap as not measured with its id, and reads nothing of it', async () => {
		const { ports: p, state } = ports(() => [runOf(1, 'queued')]);
		const scan = await scanLogs(p, [evidence]);
		expect(scan.hits).toEqual([]);
		expect(scan.unread).toEqual([
			`CI run 1: not concluded within the ${String(REHEARSAL_AWAIT_CAP_SECONDS)} s cap`,
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
		});
	});

	it('[<20ms] waits for an older run of the same workflow and commit that is still open behind a newer one, then reads both', async () => {
		const done = 13 * 60_000;
		const { ports: p, state } = ports((now) => [
			{
				...runOf(1, now < done ? 'in_progress' : 'completed'),
				createdAt: '1',
			},
			{ ...runOf(2, 'completed'), createdAt: '2' },
		]);
		const scan = await scanLogs(p, [evidence]);
		expect(scan).toEqual({ hits: [], unread: [] });
		expect(state.logReadAt).toEqual([done, done]);
	});

	it('[<20ms] reports the older run that never concludes within the cap as not measured, and still reads the others', async () => {
		const { ports: p, state } = ports(() => [
			{ ...runOf(1, 'queued'), createdAt: '1' },
			{ ...runOf(2, 'completed'), createdAt: '2' },
		]);
		const scan = await scanLogs(p, [evidence]);
		expect(scan.unread).toEqual([
			`CI run 1: not concluded within the ${String(REHEARSAL_AWAIT_CAP_SECONDS)} s cap`,
		]);
		expect(state.logReadAt).toHaveLength(1);
	});
});

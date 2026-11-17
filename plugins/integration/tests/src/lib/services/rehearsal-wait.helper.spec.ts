import { fakePartial } from '@delendai/test-kit';
import { describe, expect, it } from 'vitest';

import type {
	IRehearsalCheckRun,
	IRehearsalPullState,
	IRehearsalRun,
} from '../../../../src/lib/contracts/interfaces/rehearsal.interface';
import {
	awaitedChecks,
	openRuns,
	requiredCheckState,
} from '../../../../src/lib/services/rehearsal-wait.helper';

const pull = fakePartial<IRehearsalPullState>({
	head: 'h',
	headSha: 'sha1',
});

const check = (over: Partial<IRehearsalCheckRun>): IRehearsalCheckRun => ({
	id: 1,
	name: 'rehearsal-ci',
	headSha: 'sha1',
	status: 'completed',
	conclusion: 'success',
	startedAt: '2026-11-16T13:35:06Z',
	...over,
});

const REQUIRED = ['rehearsal-ci'];

const forgeOf = (
	checks: readonly IRehearsalCheckRun[],
): { checkRuns: () => Promise<readonly IRehearsalCheckRun[]> } => ({
	checkRuns: () => Promise.resolve(checks),
});

describe('the required checks of a head', () => {
	it('[<5ms] keeps waiting, never red, when a failed workflow run started no job and no check run exists', async () => {
		const checks = await awaitedChecks(
			forgeOf([]),
			new Map([['a', pull]]),
			['a'],
			REQUIRED,
		);
		expect(checks.red).toBeUndefined();
		expect(checks.concluded).toBe(false);
	});

	it('[<5ms] ends red at once on a failed check run', async () => {
		const checks = await awaitedChecks(
			forgeOf([check({ id: 7, conclusion: 'failure' })]),
			new Map([['a', pull]]),
			['a'],
			REQUIRED,
		);
		expect(checks.red).toMatchObject({ key: 'a', id: 7 });
	});

	it('[<5ms] does not call an older failed check run red behind a newer success of the same name', () => {
		const older = check({ id: 10, conclusion: 'failure' });
		const newer = check({
			id: 11,
			startedAt: '2026-11-16T13:35:49Z',
		});
		expect(
			requiredCheckState([older, newer], REQUIRED).red,
		).toBeUndefined();
		expect(requiredCheckState([newer, older], REQUIRED)).toEqual({
			concluded: true,
		});
	});

	it('[<5ms] breaks a tie on the start time by the higher id', () => {
		const a = check({ id: 5, conclusion: 'failure' });
		const b = check({ id: 6 });
		expect(requiredCheckState([a, b], REQUIRED).red).toBeUndefined();
	});

	it.each(['failure', 'timed_out', 'cancelled', 'action_required'])(
		'[<5ms] reads %s as red',
		(conclusion) => {
			expect(
				requiredCheckState([check({ conclusion })], REQUIRED).red,
			).toBeDefined();
		},
	);

	it('[<5ms] judges two required names independently', () => {
		const state = requiredCheckState(
			[
				check({ id: 1, name: 'a' }),
				check({ id: 2, name: 'b', conclusion: 'failure' }),
			],
			['a', 'b'],
		);
		expect(state.red?.name).toBe('b');
		expect(
			requiredCheckState([check({ name: 'a' })], ['a', 'b']).concluded,
		).toBe(false);
	});

	it('[<5ms] is not concluded while the latest check run is in progress', () => {
		expect(
			requiredCheckState([check({ status: 'in_progress' })], REQUIRED),
		).toEqual({ concluded: false });
	});

	it('[<5ms] ignores a check that is not required', () => {
		expect(
			requiredCheckState(
				[check({ name: 'other', conclusion: 'failure' })],
				REQUIRED,
			).red,
		).toBeUndefined();
	});
});

describe('the workflow runs still open', () => {
	const run = (over: Partial<IRehearsalRun>): IRehearsalRun => ({
		id: 1,
		workflow: 'land',
		event: 'workflow_dispatch',
		headBranch: 'h',
		headSha: 'sha1',
		status: 'completed',
		actor: 'a',
		createdAt: '',
		updatedAt: '',
		...over,
	});

	it('[<5ms] lists the queued and in-progress ones only', () => {
		expect(
			openRuns([
				run({ id: 1 }),
				run({ id: 2, status: 'queued' }),
				run({ id: 3, status: 'in_progress' }),
			]).map((one) => one.id),
		).toEqual([2, 3]);
	});
});

import { describe, expect, it } from 'vitest';

import type { IRehearsalRun } from '../../../../src/lib/contracts/interfaces/rehearsal.interface';
import {
	isNewestOfGroup,
	mergeUnstarted,
	unstartedOf,
} from '../../../../src/lib/services/rehearsal-unstarted.helper';

const run = (over: Partial<IRehearsalRun>): IRehearsalRun => ({
	id: 1,
	workflow: 'land',
	event: 'workflow_dispatch',
	headBranch: 'b',
	headSha: 's',
	status: 'queued',
	actor: 'a',
	createdAt: '2026-11-16T10:00:00Z',
	updatedAt: '',
	...over,
});

describe('unstarted runs', () => {
	it('[<20ms] is newest when no later run of its workflow file exists on its branch, whatever each run is named', () => {
		const stuck = run({ id: 1, workflowId: 7 });
		expect(isNewestOfGroup(stuck, [stuck])).toBe(true);
		expect(
			isNewestOfGroup(stuck, [
				stuck,
				run({
					id: 2,
					workflowId: 7,
					workflow: 'land-x-pass-b',
					createdAt: '2026-11-16T10:00:05Z',
				}),
			]),
		).toBe(false);
	});

	it('[<20ms] is not replaced by a later run of another workflow or another branch', () => {
		const stuck = run({ id: 1, workflowId: 7 });
		const later = '2026-11-16T10:00:05Z';
		expect(
			isNewestOfGroup(stuck, [
				run({ id: 2, workflowId: 8, createdAt: later }),
				run({
					id: 3,
					workflowId: 7,
					headBranch: 'c',
					createdAt: later,
				}),
			]),
		).toBe(true);
	});

	it('[<20ms] is not replaced by an earlier run', () => {
		const stuck = run({ id: 5, workflowId: 7 });
		expect(
			isNewestOfGroup(stuck, [
				run({
					id: 4,
					workflowId: 7,
					createdAt: '2026-11-16T09:00:00Z',
				}),
			]),
		).toBe(true);
	});

	it('[<20ms] falls back to the name when a run has no workflow id', () => {
		const stuck = run({ id: 1 });
		expect(
			isNewestOfGroup(stuck, [
				run({ id: 2, createdAt: '2026-11-16T10:00:05Z' }),
			]),
		).toBe(false);
	});

	it('[<20ms] describes the run and lists each id once', () => {
		const one = unstartedOf(run({ id: 9 }), []);
		expect(one).toEqual({
			id: 9,
			workflow: 'land',
			branch: 'b',
			newest: true,
		});
		expect(mergeUnstarted([one], [one, { ...one, id: 10 }])).toHaveLength(
			2,
		);
	});
});

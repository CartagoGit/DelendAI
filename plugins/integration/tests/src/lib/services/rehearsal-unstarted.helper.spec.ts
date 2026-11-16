import { describe, expect, it } from 'vitest';

import type { IRehearsalRun } from '../../../../src/lib/contracts/interfaces/rehearsal.interface';
import {
	coveringRun,
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
	const stuck = run({
		id: 1,
		workflowId: 7,
		createdAt: '2026-11-16T10:00:34Z',
	});
	const pass = (over: Partial<IRehearsalRun>): IRehearsalRun =>
		run({
			id: 2,
			workflowId: 7,
			status: 'completed',
			conclusion: 'success',
			createdAt: '2026-11-16T10:00:20Z',
			updatedAt: '2026-11-16T10:01:09Z',
			...over,
		});

	it('[<20ms] is covered by a pass that was already running and ended after it was created', () => {
		expect(coveringRun(stuck, [stuck, pass({})])?.id).toBe(2);
	});

	it('[<20ms] is lost when no pass ended after it, or the pass failed, or it is another workflow or branch', () => {
		for (const other of [
			pass({ updatedAt: '2026-11-16T10:00:30Z' }),
			pass({ conclusion: 'failure' }),
			pass({ status: 'in_progress' }),
			pass({ workflowId: 8 }),
			pass({ headBranch: 'c' }),
		])
			expect(coveringRun(stuck, [stuck, other])).toBeUndefined();
		expect(coveringRun(stuck, [stuck])).toBeUndefined();
	});

	it('[<20ms] falls back to the name when a run has no workflow id', () => {
		const bare = run({ id: 1, createdAt: '2026-11-16T10:00:34Z' });
		expect(
			coveringRun(bare, [
				bare,
				run({
					id: 2,
					status: 'completed',
					conclusion: 'success',
					updatedAt: '2026-11-16T10:01:09Z',
				}),
			])?.id,
		).toBe(2);
	});

	it('[<20ms] describes the run and lists each id once', () => {
		const one = unstartedOf(run({ id: 9 }), []);
		expect(one).toEqual({
			id: 9,
			workflow: 'land',
			branch: 'b',
			lost: true,
		});
		expect(unstartedOf(stuck, [pass({})])).toMatchObject({
			lost: false,
			coveredBy: 2,
		});
		expect(mergeUnstarted([one], [one, { ...one, id: 10 }])).toHaveLength(
			2,
		);
	});
});

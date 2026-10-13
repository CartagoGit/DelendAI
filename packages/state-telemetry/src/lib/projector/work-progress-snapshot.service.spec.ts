import { EMPTY_FOLD } from './contracts/constants/work-progress.constant';
import { describe, expect, it } from 'vitest';

import { makeEvent } from './test-support.helper';
import {
	deriveSnapshot,
	foldEvents,
	rebuildRows,
	reconcileRows,
	unknownItem,
} from './work-progress-snapshot.service';

describe('work progress snapshot', () => {
	it('splits the work item id and always carries confidence and uncertainty', () => {
		const snap = deriveSnapshot(unknownItem('f00510/S2'), EMPTY_FOLD);
		expect(snap).toMatchObject({
			proposalId: 'f00510',
			sliceId: 'S2',
			confidence: 0,
			uncertainty: 1,
		});
	});

	it('marks stalled when one failure hash repeats the threshold times', () => {
		const fail = (n: number, hash = 'x') =>
			Array.from({ length: n }, (_, i) =>
				makeEvent('p/S1', 'tool_error', i + 1, hash),
			);
		const stalled = (n: number, threshold?: number) =>
			deriveSnapshot(
				unknownItem('p/S1'),
				foldEvents(EMPTY_FOLD, fail(n)),
				threshold === undefined ? {} : { stalledThreshold: threshold },
			).stalled;
		expect(stalled(2)).toBe(false);
		expect(stalled(3)).toBe(true);
		expect(stalled(3, 4)).toBe(false);
		expect(stalled(4, 4)).toBe(true);
	});

	it('restarts the run on a different hash or on a code change', () => {
		const run = [
			makeEvent('p/S1', 'tool_error', 1, 'a'),
			makeEvent('p/S1', 'tool_error', 2, 'a'),
			makeEvent('p/S1', 'tool_error', 3, 'b'),
		];
		expect(foldEvents(EMPTY_FOLD, run).failureRun).toBe(1);
		const reset = [...run.slice(0, 2), makeEvent('p/S1', 'git_change', 3)];
		expect(foldEvents(EMPTY_FOLD, reset).failureRun).toBe(0);
	});

	it('orders rows by work item id whatever order events arrive in', () => {
		const events = [
			makeEvent('p/S2', 'git_change', 2),
			makeEvent('p/S1', 'git_change', 1),
		];
		const forward = rebuildRows(events, []);
		expect(forward.map((r) => r.snapshot.workItemId)).toEqual([
			'p/S1',
			'p/S2',
		]);
		expect(rebuildRows([...events].reverse(), [])).toEqual(forward);
	});

	it('creates rows for items that have no events yet', () => {
		const rows = rebuildRows(
			[],
			[{ ...unknownItem('p/S9'), status: 'done' }],
		);
		expect(rows[0]?.snapshot).toMatchObject({
			phase: 'done',
			progress: 100,
			eventCount: 0,
		});
	});

	it('reconcile leaves untouched rows exactly as they were', () => {
		const base = rebuildRows(
			[
				makeEvent('p/S1', 'git_change', 1),
				makeEvent('p/S2', 'git_change', 2),
			],
			[],
		);
		const next = reconcileRows(
			base,
			[makeEvent('p/S2', 'test_started', 3)],
			[],
		);
		expect(next[0]).toBe(base[0]);
		expect(next[1]?.snapshot.phase).toBe('testing');
	});
});

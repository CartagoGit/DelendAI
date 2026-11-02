import { EVENTS_APPENDED_CHANGE } from './contracts/constants/work-progress.constant';
import { describe, expect, it } from 'vitest';

import { createWorkProgressProducer } from './work-progress-producer.service';
import { makeContext, makeEvent, randomEvents } from './test-support.helper';
import type { IWorkItemInput } from './contracts/interfaces/work-progress.interface';

const producer = createWorkProgressProducer();
const ITEMS = ['p/S1', 'p/S2', 'p/S3'];
const items: IWorkItemInput[] = [
	{
		workItemId: 'p/S1',
		acceptanceCount: 4,
		acceptanceDone: 1,
		status: 'in-progress',
	},
	{
		workItemId: 'p/S2',
		acceptanceCount: 0,
		acceptanceDone: 0,
		status: 'open',
	},
];

/** The property under test runs 200 random sequences: enough to catch a fold bug and cheap for CI. */
const SEQUENCES = 200;
const SEQUENCE_LENGTH = 60;

describe('work progress producer', () => {
	it('declares the three inputs under the id work-progress', () => {
		expect(producer.id).toBe('work-progress');
		expect(producer.inputs.map((i) => i.locator)).toEqual([
			'work_events',
			'work_items',
			'work_assignments',
		]);
		expect(producer.serves).toEqual(['project']);
	});

	it('rebuilds the same canonical rows for the same events in any arrival order', () => {
		const events = randomEvents(7, 40, ITEMS);
		const a = producer.rebuild(makeContext(events, items)).canonical;
		const b = producer.rebuild(
			makeContext([...events].reverse(), items),
		).canonical;
		expect(b).toEqual(a);
	});

	it('incremental equals clean rebuild over random sequences', () => {
		for (let seed = 1; seed <= SEQUENCES; seed++) {
			const events = randomEvents(seed, SEQUENCE_LENGTH, ITEMS);
			const cut = 1 + (seed % (SEQUENCE_LENGTH - 1));
			let current = producer.rebuild(
				makeContext(events.slice(0, cut), items),
			);
			for (let at = cut; at < events.length; at += 7) {
				const delta = events.slice(at, at + 7);
				current = producer.reconcile(makeContext([], items, current), {
					kind: EVENTS_APPENDED_CHANGE,
					events: delta,
				});
			}
			expect(current.canonical).toEqual(
				producer.rebuild(makeContext(events, items)).canonical,
			);
		}
	});

	it('ignores a change kind it does not know', () => {
		const base = producer.rebuild(
			makeContext([makeEvent('p/S1', 'git_change', 1)], items),
		);
		const next = producer.reconcile(makeContext([], items, base), {
			kind: 'other',
		});
		expect(next.canonical).toEqual(base.canonical);
	});

	it('materialises stalled after three identical failures', () => {
		const events = [1, 2, 3].map((at) =>
			makeEvent('p/S1', 'tool_error', at, 'same'),
		);
		const result = producer.rebuild(makeContext(events, items));
		const rows = (
			result.canonical as {
				rows: Array<{ snapshot: { stalled: boolean } }>;
			}
		).rows;
		expect(rows[0]?.snapshot.stalled).toBe(true);
	});
});

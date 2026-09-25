/**
 * queue-order.spec.ts — one candidate moves at a time, and both the job
 * that arms and the machine that brings candidates forward pick the same
 * one.
 */
import { describe, expect, it } from 'vitest';

import {
	queueHead,
	queueOrder,
	type IQueueCandidateFacts,
} from './queue-order';

const PREFIX = 'delendai/pr/';
const candidate = (
	number: number,
	over: Partial<IQueueCandidateFacts> = {},
): IQueueCandidateFacts => ({
	number,
	headRef: `delendai/pr/agent/x${String(number)}-S1-g1/t`,
	draft: false,
	red: false,
	conflicting: false,
	...over,
});

describe('queueHead', () => {
	it('is the oldest candidate, whatever order the forge listed them in', () => {
		expect(
			queueHead([candidate(7), candidate(3), candidate(5)], PREFIX)
				?.number,
		).toBe(3);
	});

	it('passes over a red candidate, which would never merge', () => {
		expect(
			queueHead([candidate(3, { red: true }), candidate(5)], PREFIX)
				?.number,
		).toBe(5);
	});

	it('passes over a conflicting candidate, which the forge cannot merge', () => {
		expect(
			queueHead(
				[candidate(3, { conflicting: true }), candidate(5)],
				PREFIX,
			)?.number,
		).toBe(5);
	});

	it('passes over a draft', () => {
		expect(
			queueHead([candidate(3, { draft: true }), candidate(5)], PREFIX)
				?.number,
		).toBe(5);
	});

	it('never picks a pull request from outside the publication namespace', () => {
		expect(
			queueHead([candidate(1, { headRef: 'feature/theirs' })], PREFIX),
		).toBeUndefined();
	});

	it('has no head when nothing is ready', () => {
		expect(queueHead([], PREFIX)).toBeUndefined();
	});
});

describe('queueOrder', () => {
	it('keeps a conflicting candidate in its place, so it can still be brought forward', () => {
		expect(
			queueOrder(
				[
					candidate(5),
					candidate(3, { conflicting: true }),
					candidate(4, { red: true }),
					candidate(6, { draft: true }),
				],
				PREFIX,
			).map((facts) => facts.number),
		).toEqual([3, 5]);
	});

	it('has the head as its first candidate that does not conflict', () => {
		const candidates = [
			candidate(3, { conflicting: true }),
			candidate(4, { conflicting: true }),
			candidate(5),
		];
		expect(queueHead(candidates, PREFIX)).toBe(
			queueOrder(candidates, PREFIX).find((facts) => !facts.conflicting),
		);
	});
});

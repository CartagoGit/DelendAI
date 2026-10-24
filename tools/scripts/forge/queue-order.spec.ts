/**
 * queue-order.spec.ts — one candidate moves at a time, and both the job
 * that arms and the machine that brings candidates forward pick the same
 * one.
 */
import { describe, expect, it } from 'vitest';

import type { IIntegrationCertification } from './certify-integration.interface';
import {
	queueHead,
	queueOrder,
	repairStep,
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

describe('repairStep: the candidate that repairs a red integration branch', () => {
	const runs =
		(states: Record<number, IIntegrationCertification>) =>
		(candidate: IQueueCandidateFacts): IIntegrationCertification =>
			states[candidate.number] ?? 'uncertified';
	const level = () => true;

	it('arms the oldest level candidate whose full run is green', () => {
		expect(
			repairStep(
				[candidate(9), candidate(4)],
				PREFIX,
				level,
				runs({ 4: 'certified', 9: 'certified' }),
			),
		).toEqual({ kind: 'arm', number: 4 });
	});

	it('passes over a candidate whose full run is red, and dispatches one for the next', () => {
		expect(
			repairStep(
				[candidate(4), candidate(6)],
				PREFIX,
				level,
				runs({ 4: 'red' }),
			),
		).toEqual({
			kind: 'dispatch',
			number: 6,
			headRef: candidate(6).headRef,
		});
	});

	it('waits for a full run in progress instead of dispatching another', () => {
		expect(
			repairStep(
				[candidate(4), candidate(6)],
				PREFIX,
				level,
				runs({ 4: 'pending' }),
			),
		).toEqual({ kind: 'wait', number: 4 });
	});

	it('never proposes a candidate that is behind, conflicting, red or a draft', () => {
		expect(
			repairStep(
				[
					candidate(1),
					candidate(2, { conflicting: true }),
					candidate(3, { red: true }),
					candidate(5, { draft: true }),
				],
				PREFIX,
				(each) => each.number !== 1,
				runs({
					1: 'certified',
					2: 'certified',
					3: 'certified',
					5: 'certified',
				}),
			),
		).toEqual({ kind: 'none' });
	});

	it('asks nothing of a candidate after the one it chose', () => {
		const asked: number[] = [];
		repairStep([candidate(4), candidate(6)], PREFIX, level, (each) => {
			asked.push(each.number);
			return 'certified';
		});
		expect(asked).toEqual([4]);
	});
});

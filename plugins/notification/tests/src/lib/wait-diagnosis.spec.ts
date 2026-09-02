import { describe, expect, it } from 'vitest';

import { diagnoseWaitTimeout } from '../../../src/lib/services/wait-diagnosis';

import type { ILockSnapshot } from '../../../src/lib/contracts/interfaces/wait-diagnosis.interface';

const NOW = Date.parse('2026-09-02T12:00:00.000Z');
const agoMinutes = (minutes: number): string =>
	new Date(NOW - minutes * 60_000).toISOString();

const snapshotWith = (
	entries: ILockSnapshot['in_flight'],
	staleAfterMinutes = 10,
): ILockSnapshot => ({
	in_flight: entries,
	stale_after_minutes: staleAfterMinutes,
});

describe('diagnoseWaitTimeout', () => {
	it('never tells the agent to wait again — for any verdict', () => {
		// The whole point. A timeout whose advice is "call the thing that
		// just timed out" is an unbounded loop between two agents, which
		// is the failure mode this repo exists to make impossible.
		const cases: ILockSnapshot[] = [
			snapshotWith([]),
			snapshotWith([
				{ task_id: 't1', agent: 'a', last_seen: agoMinutes(99) },
			]),
			snapshotWith([
				{ task_id: 't1', agent: 'a', last_seen: agoMinutes(0) },
			]),
		];
		for (const snapshot of cases) {
			const diagnosis = diagnoseWaitTimeout({
				snapshot,
				taskId: 't1',
				nowMs: NOW,
			});
			expect(diagnosis.nextAction).not.toMatch(/await_lock again/i);
			expect(diagnosis.nextAction.length).toBeGreaterThan(0);
		}
	});

	it('reports free-now when the claim is simply gone', () => {
		const diagnosis = diagnoseWaitTimeout({
			snapshot: snapshotWith([]),
			taskId: 't1',
			nowMs: NOW,
		});
		expect(diagnosis.verdict).toBe('free-now');
		expect(diagnosis.holder).toBeUndefined();
		expect(diagnosis.nextAction).toContain('claim');
	});

	it('reports holder-gone for an entry past its heartbeat window', () => {
		// The zombie case: the row is still in the file, but nobody has
		// refreshed it. The engine evicts it on the next claim, so telling
		// the waiter to wait would guarantee a second timeout.
		const diagnosis = diagnoseWaitTimeout({
			snapshot: snapshotWith([
				{
					task_id: 't1',
					agent: 'dead-agent',
					ownership: ['src/a.ts'],
					last_seen: agoMinutes(45),
				},
			]),
			taskId: 't1',
			nowMs: NOW,
		});
		expect(diagnosis.verdict).toBe('holder-gone');
		expect(diagnosis.holder?.agent).toBe('dead-agent');
		expect(diagnosis.reason).toContain('dead-agent');
		expect(diagnosis.nextAction).toContain('claim');
	});

	it('reports holder-alive, with how long it has been held', () => {
		const diagnosis = diagnoseWaitTimeout({
			snapshot: snapshotWith([
				{
					task_id: 't1',
					agent: 'busy-agent',
					ownership: ['src/a.ts'],
					last_seen: agoMinutes(1),
				},
			]),
			taskId: 't1',
			nowMs: NOW,
		});
		expect(diagnosis.verdict).toBe('holder-alive');
		expect(diagnosis.holder?.heldForMs).toBe(60_000);
		expect(diagnosis.nextAction).toContain('different slice');
	});

	it('calls a two-party mutual wait a deadlock', () => {
		// A holds t1 and waits on t2; B holds t2 and waits on t1. Both
		// heartbeating, so no timeout rule will ever break this — only
		// seeing the cycle does.
		const snapshot = snapshotWith([
			{ task_id: 't1', agent: 'A', last_seen: agoMinutes(0) },
			{ task_id: 't2', agent: 'B', last_seen: agoMinutes(0) },
		]);
		const diagnosis = diagnoseWaitTimeout({
			snapshot,
			taskId: 't2',
			waiterAgent: 'A',
			waits: [{ waiter: 'B', waitingOnTaskId: 't1' }],
			nowMs: NOW,
		});
		expect(diagnosis.verdict).toBe('mutual-wait');
		expect(diagnosis.nextAction).toContain('release');
	});

	it('detects a three-party cycle, not just the pair', () => {
		// A→B→C→A is exactly as unresolvable as A→B→A, and only ever
		// showed up as three agents each timing out forever.
		const snapshot = snapshotWith([
			{ task_id: 't1', agent: 'A', last_seen: agoMinutes(0) },
			{ task_id: 't2', agent: 'B', last_seen: agoMinutes(0) },
			{ task_id: 't3', agent: 'C', last_seen: agoMinutes(0) },
		]);
		const diagnosis = diagnoseWaitTimeout({
			snapshot,
			taskId: 't2',
			waiterAgent: 'A',
			waits: [
				{ waiter: 'B', waitingOnTaskId: 't3' },
				{ waiter: 'C', waitingOnTaskId: 't1' },
			],
			nowMs: NOW,
		});
		expect(diagnosis.verdict).toBe('mutual-wait');
	});

	it('does not call a one-way wait a deadlock', () => {
		// B waits on a task nobody in this chain holds. A is simply
		// queued behind real work, and must not be told to give way.
		const snapshot = snapshotWith([
			{ task_id: 't1', agent: 'A', last_seen: agoMinutes(0) },
			{ task_id: 't2', agent: 'B', last_seen: agoMinutes(0) },
		]);
		const diagnosis = diagnoseWaitTimeout({
			snapshot,
			taskId: 't2',
			waiterAgent: 'A',
			waits: [{ waiter: 'B', waitingOnTaskId: 'unheld-task' }],
			nowMs: NOW,
		});
		expect(diagnosis.verdict).toBe('holder-alive');
	});

	it('terminates on a cycle that does not include the waiter', () => {
		// B and C deadlock each other; A merely waits behind B. The walk
		// must not loop forever on the B↔C edge.
		const snapshot = snapshotWith([
			{ task_id: 't1', agent: 'A', last_seen: agoMinutes(0) },
			{ task_id: 't2', agent: 'B', last_seen: agoMinutes(0) },
			{ task_id: 't3', agent: 'C', last_seen: agoMinutes(0) },
		]);
		const diagnosis = diagnoseWaitTimeout({
			snapshot,
			taskId: 't2',
			waiterAgent: 'A',
			waits: [
				{ waiter: 'B', waitingOnTaskId: 't3' },
				{ waiter: 'C', waitingOnTaskId: 't2' },
			],
			nowMs: NOW,
		});
		expect(diagnosis.verdict).toBe('holder-alive');
	});

	it('treats an entry with no last_seen as gone, not as alive', () => {
		// An entry that cannot say when it was last alive must not be
		// allowed to block anyone indefinitely.
		const diagnosis = diagnoseWaitTimeout({
			snapshot: snapshotWith([{ task_id: 't1', agent: 'ghost' }]),
			taskId: 't1',
			nowMs: NOW,
		});
		expect(diagnosis.verdict).toBe('holder-gone');
	});
});

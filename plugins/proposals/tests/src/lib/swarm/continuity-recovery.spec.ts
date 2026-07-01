import { afterEach, describe, expect, it, vi } from 'vitest';

import {
	CONTINUITY_REPEAT_RESET_THRESHOLD,
	evaluateContinuityRecovery,
	extractCheckpointNextTaskHint,
	extractTaskHint,
	isStaleLock,
	isStaleTimestamp,
} from '@mcp-vertex/proposals/lib/swarm/continuity-recovery';
import type {
	IContinuityCheckpointLike,
	IContinuityLockLike,
} from '@mcp-vertex/proposals/lib/swarm/continuity-recovery';

const NOW = new Date('2026-06-05T12:30:00.000Z').getTime();

function mockNow(value: number): void {
	vi.spyOn(Date, 'now').mockReturnValue(value);
}

describe('continuity-recovery / isStaleTimestamp', async () => {
	afterEach(() => {
		vi.restoreAllMocks();
	});

	it('returns false for a recent timestamp and true for an old one', async () => {
		mockNow(NOW);

		expect(isStaleTimestamp('2026-06-05T12:29:00.000Z')).toBe(false);
		expect(isStaleTimestamp('2026-06-05T11:00:00.000Z')).toBe(true);
	});

	it('treats invalid or missing timestamps as non-stale', async () => {
		mockNow(NOW);

		expect(isStaleTimestamp(undefined)).toBe(false);
		expect(isStaleTimestamp('not-a-date')).toBe(false);
		expect(isStaleTimestamp('')).toBe(false);
	});
});

describe('continuity-recovery / isStaleLock', async () => {
	afterEach(() => {
		vi.restoreAllMocks();
	});

	it('uses the lock last_seen to decide staleness', async () => {
		mockNow(NOW);

		const staleLock: IContinuityLockLike = {
			task_id: 'p40-T1',
			last_seen: '2026-06-05T12:00:00.000Z',
		};
		const freshLock: IContinuityLockLike = {
			task_id: 'p40-T1',
			last_seen: '2026-06-05T12:29:00.000Z',
		};

		expect(isStaleLock(staleLock)).toBe(true);
		expect(isStaleLock(freshLock)).toBe(false);
		expect(isStaleLock(undefined)).toBe(false);
	});
});

describe('continuity-recovery / extractTaskHint', async () => {
	it('extracts a T-style task id from a free-form string', async () => {
		expect(extractTaskHint('Continue with p40-T1 next.')).toBe('T1');
	});

	it('uppercases the captured task id regardless of input case', async () => {
		expect(extractTaskHint('jump to t2 directly')).toBe('T2');
	});

	it('returns undefined when no task id is present', async () => {
		expect(extractTaskHint('no task here')).toBeUndefined();
		expect(extractTaskHint(undefined)).toBeUndefined();
	});
});

describe('continuity-recovery / extractCheckpointNextTaskHint', async () => {
	it('prefers nextAction when it carries a task id', async () => {
		const checkpoint: IContinuityCheckpointLike = {
			nextAction: 'Siguiente task: p40-T2 al implementation_runner.',
			handoffs: [{ message: 'old p40-T1 handoff' }],
		};
		expect(extractCheckpointNextTaskHint(checkpoint)).toBe('T2');
	});

	it('falls back to the first handoff message that carries a task id', async () => {
		const checkpoint: IContinuityCheckpointLike = {
			handoffs: [
				{ message: 'context only' },
				{ message: 'continue on p40-T3' },
			],
		};
		expect(extractCheckpointNextTaskHint(checkpoint)).toBe('T3');
	});

	it('returns undefined when neither nextAction nor handoffs yield a task id', async () => {
		const checkpoint: IContinuityCheckpointLike = {
			nextAction: 'no task id here',
			handoffs: [{ message: 'no task id either' }],
		};
		expect(extractCheckpointNextTaskHint(checkpoint)).toBeUndefined();
	});
});

describe('continuity-recovery / evaluateContinuityRecovery', async () => {
	afterEach(() => {
		vi.restoreAllMocks();
	});

	it('returns shouldReset: false when there is no lock and no checkpoint', async () => {
		const decision = evaluateContinuityRecovery({
			lock: undefined,
			checkpoint: null,
			requestedMode: 'auto',
			proposalId: 'p40',
		});
		expect(decision).toEqual({ shouldReset: false });
	});

	it('flags a stale lock and extracts the task hint from task_id', async () => {
		mockNow(NOW);

		const decision = evaluateContinuityRecovery({
			lock: {
				task_id: 'p40-T1',
				last_seen: '2026-06-05T12:00:00.000Z',
			},
			checkpoint: null,
			requestedMode: 'auto',
			proposalId: 'p40',
		});

		expect(decision.shouldReset).toBe(true);
		expect(decision.taskHint).toBe('T1');
		expect(decision.reason).toContain('stale lock');
	});

	it('flags a stale checkpoint by repeatedCount >= threshold', async () => {
		const checkpoint: IContinuityCheckpointLike = {
			status: 'in_progress',
			updatedAt: '2026-06-05T12:29:00.000Z',
			recovery: {
				repeatedCount: CONTINUITY_REPEAT_RESET_THRESHOLD,
			},
		};
		const decision = evaluateContinuityRecovery({
			lock: undefined,
			checkpoint,
			requestedMode: 'auto',
			proposalId: 'p40',
		});

		expect(decision.shouldReset).toBe(true);
		expect(decision.reason).toContain('stale checkpoint');
	});

	it('flags a stale checkpoint by timestamp', async () => {
		mockNow(NOW);

		const checkpoint: IContinuityCheckpointLike = {
			status: 'in_progress',
			updatedAt: '2026-06-05T12:00:00.000Z',
		};
		const decision = evaluateContinuityRecovery({
			lock: undefined,
			checkpoint,
			requestedMode: 'auto',
			proposalId: 'p40',
		});

		expect(decision.shouldReset).toBe(true);
		expect(decision.reason).toContain('stale checkpoint');
	});

	it('does not reset when the checkpoint is in a closed status', async () => {
		const checkpoint: IContinuityCheckpointLike = {
			status: 'slice-complete',
			updatedAt: '2026-06-05T12:00:00.000Z',
			recovery: {
				repeatedCount: CONTINUITY_REPEAT_RESET_THRESHOLD + 5,
			},
		};
		const decision = evaluateContinuityRecovery({
			lock: undefined,
			checkpoint,
			requestedMode: 'auto',
			proposalId: 'p40',
		});

		expect(decision.shouldReset).toBe(false);
	});

	it('does not reset for a fresh lock and fresh checkpoint', async () => {
		mockNow(NOW);

		const decision = evaluateContinuityRecovery({
			lock: {
				task_id: 'p40-T1',
				last_seen: '2026-06-05T12:29:00.000Z',
			},
			checkpoint: {
				status: 'in_progress',
				updatedAt: '2026-06-05T12:29:00.000Z',
			},
			requestedMode: 'auto',
			proposalId: 'p40',
		});

		expect(decision.shouldReset).toBe(false);
		expect(decision.taskHint).toBeUndefined();
		expect(decision.reason).toBeUndefined();
	});
});

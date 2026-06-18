import { describe, expect, it, vi, afterEach } from 'vitest';

import {
	CONTINUITY_REPEAT_RESET_THRESHOLD,
	CONTINUITY_STALE_WINDOW_MS,
	isStaleLock,
	isStaleTimestamp,
	shouldResetFromCheckpoint,
} from '@mcp-vertex/proposals/lib/swarm/runtime-recovery';
import type {
	IRuntimeRecoveryCheckpoint,
	IRuntimeRecoveryLock,
} from '@mcp-vertex/proposals/lib/swarm/runtime-recovery';

const NOW = new Date('2026-06-05T12:30:00.000Z').getTime();

function mockNow(value: number): void {
	vi.spyOn(Date, 'now').mockReturnValue(value);
}

describe('runtime-recovery helpers', () => {
	afterEach(() => {
		vi.restoreAllMocks();
	});

	it('marks a timestamp as stale when it is older than the configured window', () => {
		mockNow(NOW);

		expect(isStaleTimestamp('2026-06-05T12:14:59.999Z')).toBe(true);
		expect(isStaleTimestamp('2026-06-05T12:15:00.001Z')).toBe(false);
	});

	it('treats invalid or missing timestamps as non-stale for runtime recovery', () => {
		mockNow(NOW);

		expect(isStaleTimestamp(undefined)).toBe(false);
		expect(isStaleTimestamp('not-an-iso-date')).toBe(false);
	});

	it('marks a lock as stale using its last_seen timestamp', () => {
		mockNow(NOW);

		const staleLock: IRuntimeRecoveryLock = {
			task_id: 'p40-T1',
			agent: 'implementation_runner',
			last_seen: '2026-06-05T12:14:00.000Z',
		};

		expect(isStaleLock(staleLock)).toBe(true);
		expect(isStaleLock(undefined)).toBe(false);
	});

	it('does not reset from checkpoint when the checkpoint is already closed', () => {
		const checkpoint: IRuntimeRecoveryCheckpoint = {
			proposalId: 'p40',
			status: 'done',
			recovery: { repeatedCount: CONTINUITY_REPEAT_RESET_THRESHOLD + 1 },
		};

		expect(shouldResetFromCheckpoint(checkpoint)).toBe(false);
	});

	it('resets from checkpoint when repeatedCount crosses the threshold', () => {
		const checkpoint: IRuntimeRecoveryCheckpoint = {
			proposalId: 'p40',
			status: 'in_progress',
			recovery: { repeatedCount: CONTINUITY_REPEAT_RESET_THRESHOLD },
		};

		expect(shouldResetFromCheckpoint(checkpoint)).toBe(true);
	});

	it('resets from checkpoint when lastHealthyAt is stale even if updatedAt is missing', () => {
		mockNow(NOW + CONTINUITY_STALE_WINDOW_MS + 1);

		const checkpoint: IRuntimeRecoveryCheckpoint = {
			proposalId: 'p40',
			status: 'in_progress',
			recovery: {
				repeatedCount: 0,
				lastHealthyAt: '2026-06-05T12:00:00.000Z',
			},
		};

		expect(shouldResetFromCheckpoint(checkpoint)).toBe(true);
	});

	it('falls back to updatedAt or lastUpdated when checking checkpoint staleness', () => {
		mockNow(NOW + CONTINUITY_STALE_WINDOW_MS + 1);

		expect(
			shouldResetFromCheckpoint({
				proposalId: 'p40',
				status: 'in_progress',
				updatedAt: '2026-06-05T12:00:00.000Z',
			})
		).toBe(true);

		expect(
			shouldResetFromCheckpoint({
				proposalId: 'p40',
				status: 'in_progress',
				lastUpdated: '2026-06-05T12:00:00.000Z',
			})
		).toBe(true);
	});
});

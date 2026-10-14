import { describe, expect, it } from 'vitest';

import {
	isLockEntryOrphaned,
	type ILockLivenessProbe,
} from '../../../../src/lib/locks/orphaned-lock';

const probe = (
	alive: readonly number[],
	host = 'builder-1',
): ILockLivenessProbe => ({
	host,
	isProcessAlive: (pid) => alive.includes(pid),
});

describe('isLockEntryOrphaned', () => {
	it('reclaims a claim whose owning process is gone', () => {
		// The zombie case: an agent that crashed, was killed, or simply
		// ended its session. Time-based expiry made every other agent
		// wait out the full stale window for an owner that no longer
		// exists.
		expect(
			isLockEntryOrphaned({ host: 'builder-1', pid: 4242 }, probe([])),
		).toBe(true);
	});

	it('never touches a live owner, however slow it is', () => {
		// The false-positive case, and the reason the window could not
		// simply be shortened: a long test run or a big checkout is not
		// an abandoned lock.
		expect(
			isLockEntryOrphaned(
				{ host: 'builder-1', pid: 4242 },
				probe([4242]),
			),
		).toBe(false);
	});

	it("never judges another machine's claim", () => {
		// This host's process table says nothing about a pid on another
		// machine; guessing would evict a healthy remote agent.
		expect(
			isLockEntryOrphaned({ host: 'builder-9', pid: 4242 }, probe([])),
		).toBe(false);
	});

	it('falls back to time when the owner was never recorded', () => {
		// Locks written before pids were recorded, or by a host that does
		// not report one. Refusing to guess is what keeps this from
		// becoming a new source of false positives.
		expect(isLockEntryOrphaned({}, probe([]))).toBe(false);
		expect(isLockEntryOrphaned({ host: 'builder-1' }, probe([]))).toBe(
			false,
		);
	});

	it('ignores a malformed pid rather than acting on it', () => {
		expect(
			isLockEntryOrphaned({ host: 'builder-1', pid: 0 }, probe([])),
		).toBe(false);
		expect(
			isLockEntryOrphaned({ host: 'builder-1', pid: -1 }, probe([])),
		).toBe(false);
		expect(
			isLockEntryOrphaned({ host: 'builder-1', pid: 1.5 }, probe([])),
		).toBe(false);
	});
});

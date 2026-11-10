import { describe, expect, it } from 'vitest';

import {
	isLockEntryExpired,
	isLockEntryOrphaned,
	isLockEntryStale,
} from '../../../../src/lib/shared/lock-entry-expiry';

const NOW = Date.parse('2026-09-02T12:00:00.000Z');
const minutesAgo = (n: number): string =>
	new Date(NOW - n * 60_000).toISOString();

describe('isLockEntryStale', () => {
	it('holds a claim that is still heartbeating', () => {
		expect(isLockEntryStale({ last_seen: minutesAgo(2) }, 10, NOW)).toBe(
			false,
		);
	});

	it('drops a claim past its heartbeat window', () => {
		expect(isLockEntryStale({ last_seen: minutesAgo(11) }, 10, NOW)).toBe(
			true,
		);
	});

	it('drops an entry that cannot say when it was last alive', () => {
		// An entry with no usable `last_seen` cannot be trusted to block
		// anyone — the alternative is a lock nobody can ever clear.
		expect(isLockEntryStale({}, 10, NOW)).toBe(true);
		expect(isLockEntryStale({ last_seen: 'not-a-date' }, 10, NOW)).toBe(
			true,
		);
	});
});

describe('isLockEntryOrphaned', () => {
	const policy = (alive: readonly number[]) => ({
		host: 'builder-1',
		isProcessAlive: (pid: number) => alive.includes(pid),
	});

	it('reclaims a claim whose owning process is gone', () => {
		expect(
			isLockEntryOrphaned({ host: 'builder-1', pid: 99 }, policy([])),
		).toBe(true);
	});

	it('never evicts a live owner, however slow', () => {
		expect(
			isLockEntryOrphaned({ host: 'builder-1', pid: 99 }, policy([99])),
		).toBe(false);
	});

	it("never judges another machine's claim", () => {
		expect(
			isLockEntryOrphaned({ host: 'builder-9', pid: 99 }, policy([])),
		).toBe(false);
	});

	it('skips the check entirely when no probe is supplied', () => {
		// A reader that cannot ask the OS must fall back to time rather
		// than guess.
		expect(isLockEntryOrphaned({ host: 'builder-1', pid: 99 }, {})).toBe(
			false,
		);
	});
});

describe('isLockEntryExpired', () => {
	it('is the single answer every reader of the lock file gives', () => {
		// The engine and the `await_lock` waiter used to disagree exactly
		// when it mattered: the engine handed the files to a new claimant
		// while the waiter kept waiting on the dead holder. A lock that is
		// both free and held is the worst possible answer to give an agent.
		const dead = { last_seen: minutesAgo(1), host: 'h', pid: 99 };
		expect(
			isLockEntryExpired(dead, {
				staleAfterMinutes: 10,
				nowMs: NOW,
				host: 'h',
				isProcessAlive: () => false,
			}),
		).toBe(true);
		expect(
			isLockEntryExpired(dead, {
				staleAfterMinutes: 10,
				nowMs: NOW,
				host: 'h',
				isProcessAlive: () => true,
			}),
		).toBe(false);
	});
});

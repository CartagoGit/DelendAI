import { hostname } from 'node:os';

import { isLockEntryOrphaned as isSharedLockEntryOrphaned } from '@mcp-vertex/core/lib/shared/lock-entry-expiry';

import type { ILockLivenessProbe } from '../contracts/interfaces/lock-liveness-probe.interface';

import type { ILockEntry } from './agent-lock-engine';

/**
 * A lock whose owner is demonstrably gone.
 *
 * Ownership expiry was purely time-based: an entry survived until it
 * went `stale_after_minutes` (10 by default) without a heartbeat. That
 * single knob has to serve two opposite failure modes, and it serves
 * both badly.
 *
 * - **Zombies.** An agent that crashes, is killed, or simply ends its
 *   session leaves its claim standing for the full window. Every other
 *   agent in the swarm is refused the files for ten minutes over an
 *   owner that no longer exists — the exact "nobody knows what to do"
 *   stall this is meant to prevent.
 * - **False positives.** Shortening the window to release zombies
 *   faster starts evicting agents that are alive and merely slow — a
 *   long test run, a big checkout — and two agents then write the same
 *   files believing they own them.
 *
 * The owner's identity is already recorded (`host`, `pid`). Asking the
 * operating system whether that process still exists answers the
 * question directly, so the two failure modes stop trading against each
 * other: a dead owner is reclaimable at once, and a live one is never
 * evicted early no matter how long it takes.
 *
 * The judgement is deliberately narrow. An entry is orphaned ONLY when
 * we can be sure: same host, a real pid, and the OS says that pid is
 * gone. Anything else — an entry from another machine, a lock written
 * before pids were recorded, a pid we are not permitted to probe —
 * falls back to the time-based rule. Refusing to guess is what keeps
 * this from becoming a new source of false positives.
 */
export type { ILockLivenessProbe };

/**
 * Signal 0 performs the permission and existence checks without
 * delivering anything. `ESRCH` means "no such process" — the only
 * answer that proves the owner is gone. `EPERM` means the process
 * exists but belongs to another user, which is emphatically NOT an
 * orphan.
 */
export const isProcessAlive = (pid: number): boolean => {
	try {
		process.kill(pid, 0);
		return true;
	} catch (error) {
		const code = (error as NodeJS.ErrnoException).code;
		if (code === 'ESRCH') return false;
		// EPERM, or anything we cannot interpret: assume alive.
		return true;
	}
};

export const defaultLivenessProbe = (): ILockLivenessProbe => ({
	host: hostname(),
	isProcessAlive,
});

export const isLockEntryOrphaned = (
	entry: Pick<ILockEntry, 'host' | 'pid'>,
	probe: ILockLivenessProbe = defaultLivenessProbe(),
): boolean =>
	// Delegates to the shared rule in core so every reader of the lock
	// file — the engine here, `notification`'s `await_lock` waiter —
	// answers "is this still held?" identically.
	isSharedLockEntryOrphaned(entry, {
		host: probe.host,
		isProcessAlive: probe.isProcessAlive,
	});

import { hostname } from 'node:os';

import type { ILockExpiryPolicy } from '@delendai/core/lib/contracts/interfaces/lock-entry-expiry.interface';

/**
 * Default when the lock file does not declare its own window. Mirrors
 * the engine's default; the file's own `stale_after_minutes` wins
 * whenever it is present, so the two cannot drift apart in practice.
 */
const DEFAULT_STALE_AFTER_MINUTES = 10;

/**
 * Signal 0 performs the permission and existence checks without
 * delivering anything. `ESRCH` is the only answer that proves the owner
 * is gone; `EPERM` means the process exists but belongs to someone
 * else, which is emphatically not an orphan.
 */
const isProcessAlive = (pid: number): boolean => {
	try {
		process.kill(pid, 0);
		return true;
	} catch (error) {
		return (error as NodeJS.ErrnoException).code !== 'ESRCH';
	}
};

/**
 * The expiry policy this host applies when reading someone else's lock
 * file. `await_lock` must answer "is this still held?" exactly as the
 * lock engine does — a claim the engine has already dropped must not
 * keep a waiter parked for its full timeout.
 */
export const lockExpiryPolicyFor = (
	staleAfterMinutes: unknown,
): ILockExpiryPolicy => ({
	staleAfterMinutes:
		typeof staleAfterMinutes === 'number'
			? staleAfterMinutes
			: DEFAULT_STALE_AFTER_MINUTES,
	host: hostname(),
	isProcessAlive,
});

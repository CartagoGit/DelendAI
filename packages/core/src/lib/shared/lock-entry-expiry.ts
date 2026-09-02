/**
 * When a lock entry stops counting as held — one rule, for everyone who
 * reads the lock file.
 *
 * The agent lock is written by `proposals` and read by more than one
 * plugin: `notification`'s `await_lock` waits on it so an agent can
 * sleep until a peer releases, rather than busy-polling. Each reader had
 * its own idea of "held": the engine dropped entries past
 * `stale_after_minutes` (and, since the orphan check, entries whose
 * owning process is gone), while the waiter matched raw `task_id`s with
 * no expiry at all.
 *
 * So the two disagreed exactly when it mattered. The engine would hand
 * the files to a new claimant while the waiter kept waiting on the dead
 * holder for its full timeout — a lock that is simultaneously free and
 * held, which is the worst possible answer to give an agent deciding
 * what to do next.
 *
 * The rule lives here, in core, because it belongs to no single plugin:
 * `notification` must not import `proposals` (either has to run without
 * the other), but both have to answer this question the same way.
 */
export interface ILockExpiryEntry {
	readonly last_seen?: string | undefined;
	readonly host?: string | undefined;
	readonly pid?: number | undefined;
}

export interface ILockExpiryPolicy {
	readonly staleAfterMinutes: number;
	readonly nowMs?: number;
	/** This host's id and a liveness probe; omit to skip the orphan check. */
	readonly host?: string | undefined;
	readonly isProcessAlive?: ((pid: number) => boolean) | undefined;
}

/**
 * Past its heartbeat window. A missing or unparseable `last_seen` counts
 * as expired: an entry that cannot say when it was last alive cannot be
 * trusted to block anyone.
 */
export const isLockEntryStale = (
	entry: ILockExpiryEntry,
	staleAfterMinutes: number,
	nowMs: number = Date.now(),
): boolean => {
	const lastSeenMs = new Date(entry.last_seen ?? '').getTime();
	if (Number.isNaN(lastSeenMs)) return true;
	return nowMs - lastSeenMs > staleAfterMinutes * 60_000;
};

/**
 * Owner demonstrably gone. Deliberately narrow — same host, a real pid,
 * and an explicit "no such process" — so a slow-but-alive holder is
 * never evicted and another machine's claim is never judged.
 */
export const isLockEntryOrphaned = (
	entry: ILockExpiryEntry,
	policy: Pick<ILockExpiryPolicy, 'host' | 'isProcessAlive'>,
): boolean => {
	if (policy.host === undefined || policy.isProcessAlive === undefined) {
		return false;
	}
	if (entry.host === undefined || entry.host !== policy.host) return false;
	if (typeof entry.pid !== 'number' || !Number.isInteger(entry.pid)) {
		return false;
	}
	if (entry.pid <= 0) return false;
	return !policy.isProcessAlive(entry.pid);
};

/** Held no longer, by either rule. */
export const isLockEntryExpired = (
	entry: ILockExpiryEntry,
	policy: ILockExpiryPolicy,
): boolean =>
	isLockEntryStale(entry, policy.staleAfterMinutes, policy.nowMs) ||
	isLockEntryOrphaned(entry, policy);

import type { ILockEntry, ILockFile } from '../locks/agent-lock-engine';

import { isLockEntryStale as isSharedLockEntryStale } from '@delendai/core/lib/shared/lock-entry-expiry';

import { readJsonOrNull } from '../proposals/index-reader';

export interface IPurgeStaleLocksOptions {
	readonly agentLockEngine?: {
		readonly lockPath?: string;
	};
	readonly lockPath?: string;
	readonly staleAfterMinutes?: number;
	readonly now?: () => string;
}

export interface IPurgeStaleLocksResult {
	readonly purged: number;
	readonly taskIds: string[];
	readonly lastStaleSeen?: string;
}

const EMPTY_RESULT: IPurgeStaleLocksResult = {
	purged: 0,
	taskIds: [],
};

const resolveLockPath = (
	options: IPurgeStaleLocksOptions,
): string | undefined => options.lockPath ?? options.agentLockEngine?.lockPath;

const resolveNowMs = (options: IPurgeStaleLocksOptions): number => {
	const injected = options.now?.();
	if (injected === undefined) return Date.now();
	const nowMs = new Date(injected).getTime();
	return Number.isNaN(nowMs) ? Date.now() : nowMs;
};

/**
 * Delegates to the shared rule in core. More than one plugin reads this
 * lock file — `notification`'s `await_lock` waits on it — and each
 * reader having its own idea of "held" made the engine and the waiter
 * disagree exactly when it mattered.
 */
export const isLockEntryStale = (
	entry: Pick<ILockEntry, 'last_seen'>,
	thresholdMinutes: number,
	nowMs = Date.now(),
): boolean => isSharedLockEntryStale(entry, thresholdMinutes, nowMs);

export const summarizeStaleLocks = (
	lock: Pick<ILockFile, 'in_flight' | 'stale_after_minutes'>,
	staleAfterMinutes = lock.stale_after_minutes,
	nowMs = Date.now(),
): IPurgeStaleLocksResult => {
	const staleEntries = lock.in_flight.filter((entry) =>
		isLockEntryStale(entry, staleAfterMinutes, nowMs),
	);
	if (staleEntries.length === 0) return EMPTY_RESULT;

	let latestStaleMs = Number.NEGATIVE_INFINITY;
	for (const entry of staleEntries) {
		const lastSeenMs = new Date(entry.last_seen).getTime();
		if (!Number.isNaN(lastSeenMs) && lastSeenMs > latestStaleMs) {
			latestStaleMs = lastSeenMs;
		}
	}

	return {
		purged: staleEntries.length,
		taskIds: staleEntries.map((entry) => entry.task_id),
		...(Number.isFinite(latestStaleMs)
			? { lastStaleSeen: new Date(latestStaleMs).toISOString() }
			: {}),
	};
};

/**
 * Shared stale-lock scan for read-only tools. Despite the historical
 * "purge" name, this helper never mutates the lock file; it only reports
 * which entries the engine GC would drop.
 */
export const purgeStaleLocks = async (
	options: IPurgeStaleLocksOptions = {},
): Promise<IPurgeStaleLocksResult> => {
	const lockPath = resolveLockPath(options);
	if (lockPath === undefined) return EMPTY_RESULT;

	const parsed = await readJsonOrNull<Partial<ILockFile>>(lockPath);
	if (parsed === null) return EMPTY_RESULT;

	return summarizeStaleLocks(
		{
			stale_after_minutes: parsed.stale_after_minutes ?? 10,
			in_flight: Array.isArray(parsed.in_flight)
				? (parsed.in_flight as ILockEntry[])
				: [],
		},
		options.staleAfterMinutes,
		resolveNowMs(options),
	);
};

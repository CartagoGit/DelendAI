/**
 * lock-store.ts — r00042 S3.
 *
 * Moved out of `locks/engine.ts` verbatim: the engine was 1,394 lines
 * against the 600-line ceiling this proposal sets, and it is
 * concurrency-sensitive code with a recorded history of subtle
 * correctness bugs. Declarations were relocated, never rewritten.
 */
import type {
	IAgentLockArgs,
	IAgentLockDeps,
	ILockFile,
} from '../contracts/interfaces/agent-lock.interface';
import type { ILockLivenessProbe } from './orphaned-lock';
import { isLockEntryStale } from '../shared/purge-stale-locks';
import { pruneFileLocksForTasks } from './lock-lifecycle';
import { getLockPath, getMutexOptions, getNow } from './lock-paths';
import { defaultLivenessProbe, isLockEntryOrphaned } from './orphaned-lock';
import { sweepStaleAgentLockTmpFiles } from './tmp-file-sweeper';
import {
	SafeWorkspaceReader,
	withFileMutex,
	writeFileAtomic,
} from '@delendai/core/public';
import { basename, dirname } from 'node:path';

export const EMPTY_LOCK = (): ILockFile => ({
	version: 1,
	stale_after_minutes: 10,
	in_flight: [],
});

export const loadLock = async (
	deps: IAgentLockDeps = {},
): Promise<ILockFile> => {
	const lockPath = getLockPath(deps);
	let raw: string;
	try {
		raw = (
			await new SafeWorkspaceReader(dirname(lockPath)).readText(
				basename(lockPath),
			)
		).content;
	} catch {
		return EMPTY_LOCK();
	}
	const parsed = JSON.parse(raw) as ILockFile;
	if (!Array.isArray(parsed.in_flight)) parsed.in_flight = [];
	return parsed;
};

export const writeLock = async (
	lock: ILockFile,
	deps: IAgentLockDeps = {},
): Promise<void> => {
	const lockPath = getLockPath(deps);
	await writeFileAtomic(lockPath, `${JSON.stringify(lock, null, '\t')}\n`);
};

/**
 * Drop every claim whose owner is gone — by the clock, or by the
 * operating system.
 *
 * Time alone had to serve two opposite failure modes: a crashed agent
 * held its files for the full stale window, while shortening that
 * window started evicting agents that were alive and merely slow. A
 * claim records its owner (`host`, `pid`), so on this host the question
 * can be answered outright instead of estimated — see
 * `orphaned-lock.ts` for why the check is deliberately narrow.
 */

/**
 * Drop every claim whose owner is gone — by the clock, or by the
 * operating system.
 *
 * Time alone had to serve two opposite failure modes: a crashed agent
 * held its files for the full stale window, while shortening that
 * window started evicting agents that were alive and merely slow. A
 * claim records its owner (`host`, `pid`), so on this host the question
 * can be answered outright instead of estimated — see
 * `orphaned-lock.ts` for why the check is deliberately narrow.
 */
export const removeStale = (
	lock: ILockFile,
	nowMs = Date.now(),
	probe: ILockLivenessProbe = defaultLivenessProbe(),
): ILockFile => ({
	...lock,
	in_flight: lock.in_flight.filter(
		(entry) =>
			!isLockEntryStale(entry, lock.stale_after_minutes, nowMs) &&
			!isLockEntryOrphaned(entry, probe),
	),
});

export const writeLockWithMutex = async (
	lock: ILockFile,
	args: Pick<IAgentLockArgs, 'onContention'>,
	deps: IAgentLockDeps,
): Promise<void> => {
	await withFileMutex(
		getLockPath(deps),
		() => writeLock(lock, deps),
		getMutexOptions(args, deps),
	);
};

export const readSynchronizedLock = async (
	deps: IAgentLockDeps,
): Promise<ILockFile> => {
	const raw = await loadLock(deps);
	const nowMs = Date.parse(getNow(deps));
	const cleaned = removeStale(raw, Number.isNaN(nowMs) ? Date.now() : nowMs);
	const activeTaskIds = new Set(
		cleaned.in_flight.map((entry) => entry.task_id),
	);
	const staleTaskIds = raw.in_flight
		.filter((entry) => !activeTaskIds.has(entry.task_id))
		.map((entry) => entry.task_id);
	if (staleTaskIds.length > 0) {
		await pruneFileLocksForTasks(staleTaskIds, deps);
		await writeLock(cleaned, deps);
	}
	return cleaned;
};

export const readLock = async (
	deps: IAgentLockDeps = {},
): Promise<ILockFile> => {
	const lockPath = getLockPath(deps);
	const raw = await loadLock(deps);
	const cleaned = removeStale(raw);
	await sweepStaleAgentLockTmpFiles(lockPath);
	return cleaned;
};

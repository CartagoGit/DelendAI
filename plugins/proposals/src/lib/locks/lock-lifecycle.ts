/**
 * lock-lifecycle.ts — r00042 S3.
 *
 * Moved out of `locks/engine.ts` verbatim: the engine was 1,394 lines
 * against the 600-line ceiling this proposal sets, and it is
 * concurrency-sensitive code with a recorded history of subtle
 * correctness bugs. Declarations were relocated, never rewritten.
 */
import type {
	IAgentLockDeps,
	ILockFile,
} from '../contracts/interfaces/agent-lock.interface';
import { removeFileLocksForTask } from './file-lock-table';
import {
	getFileLockTablePath,
	getLockPath,
	getMutexOptions,
} from './lock-paths';
import { loadLock, removeStale, writeLock } from './lock-store';
import { resolveCallerHostId } from './release-audit';
import { sweepStaleAgentLockTmpFiles } from './tmp-file-sweeper';
import { withFileMutex } from '@delendai/core/public';

export const pruneFileLocksForTasks = async (
	taskIds: readonly string[],
	deps: IAgentLockDeps,
): Promise<void> => {
	const tablePath = getFileLockTablePath(deps);
	for (const taskId of taskIds) {
		await removeFileLocksForTask({ taskId, tablePath });
	}
};

export const getFileLockDeps = (
	deps: IAgentLockDeps,
): {
	tablePath: string;
	now?: () => string;
	mutexTimeoutMs?: number;
	mutexStaleMs?: number;
	mutexPollMs?: number;
} => ({
	tablePath: getFileLockTablePath(deps),
	...(deps.now !== undefined ? { now: deps.now } : {}),
	...(deps.mutexTimeoutMs !== undefined
		? { mutexTimeoutMs: deps.mutexTimeoutMs }
		: {}),
	...(deps.mutexStaleMs !== undefined
		? { mutexStaleMs: deps.mutexStaleMs }
		: {}),
	...(deps.mutexPollMs !== undefined
		? { mutexPollMs: deps.mutexPollMs }
		: {}),
});

export const cleanupStaleAgentLockState = async (
	deps: IAgentLockDeps = {},
	options: {
		readonly staleTmpMs?: number;
	} = {},
): Promise<{
	readonly droppedClaims: number;
	readonly droppedTmpFiles: number;
	readonly lock: ILockFile;
}> =>
	withFileMutex(
		getFileLockTablePath(deps),
		async () => {
			const raw = await loadLock(deps);
			const cleaned = removeStale(raw);
			const staleTaskIds = raw.in_flight
				.filter(
					(entry) =>
						!cleaned.in_flight.some(
							(active) => active.task_id === entry.task_id,
						),
				)
				.map((entry) => entry.task_id);
			if (staleTaskIds.length > 0) {
				await pruneFileLocksForTasks(staleTaskIds, deps);
				await writeLock(cleaned, deps);
			}
			const droppedTmpFiles = await sweepStaleAgentLockTmpFiles(
				getLockPath(deps),
				options.staleTmpMs,
			);
			return {
				droppedClaims: raw.in_flight.length - cleaned.in_flight.length,
				droppedTmpFiles: droppedTmpFiles.length,
				lock: cleaned,
			};
		},
		getMutexOptions({}, deps),
	);

/**
 * Release every claim owned by the current host process.
 *
 * This is the explicit session-close path: when the MCP transport closes,
 * callers can release immediately instead of waiting for heartbeat TTL GC.
 * The host/pid match prevents one process from deleting another process's
 * active claims, and the operation is idempotent when called more than once.
 */

/**
 * Release every claim owned by the current host process.
 *
 * This is the explicit session-close path: when the MCP transport closes,
 * callers can release immediately instead of waiting for heartbeat TTL GC.
 * The host/pid match prevents one process from deleting another process's
 * active claims, and the operation is idempotent when called more than once.
 */
export const releaseAgentSessionClaims = async (
	deps: IAgentLockDeps = {},
): Promise<{ readonly releasedTaskIds: readonly string[] }> => {
	const caller = resolveCallerHostId(deps);
	return withFileMutex(
		getFileLockTablePath(deps),
		async () => {
			const raw = await loadLock(deps);
			const owned = raw.in_flight.filter(
				(entry) =>
					typeof entry.host === 'string' &&
					entry.host === caller.host &&
					typeof entry.pid === 'number' &&
					entry.pid === caller.pid,
			);
			if (owned.length === 0) return { releasedTaskIds: [] };
			const releasedTaskIds = owned.map((entry) => entry.task_id);
			await pruneFileLocksForTasks(releasedTaskIds, deps);
			const released = new Set(releasedTaskIds);
			const cleaned: ILockFile = {
				...raw,
				in_flight: raw.in_flight.filter(
					(entry) => !released.has(entry.task_id),
				),
			};
			await writeLock(cleaned, deps);
			return { releasedTaskIds };
		},
		getMutexOptions({}, deps),
	);
};

/**
 * contention-escalation.ts — r00042 S3.
 *
 * Moved out of `locks/engine.ts` verbatim: the engine was 1,394 lines
 * against the 600-line ceiling this proposal sets, and it is
 * concurrency-sensitive code with a recorded history of subtle
 * correctness bugs. Declarations were relocated, never rewritten.
 */
import type {
	IAgentLockDeps,
	IAgentLockResponse,
} from '../contracts/interfaces/agent-lock.interface';
import {
	noteFileLockContention,
	resolveFileLockContentions,
} from './file-lock-table';
import { lockResult } from './lock-args';
import { getFileLockDeps } from './lock-lifecycle';
import { withFileMutex } from '@delendai/core/public';
import { LIVELOCK_NEXT } from '../contracts/constants/agent-lock-engine.constant';

// f00154 S2 audit: the LIVELOCK_THRESHOLD used to be a hardcoded
// 5_000ms — shorter than `withFileMutex`'s default heartbeatMs
// (staleMs / 3, default 10_000ms when staleMs is 30_000ms). A holder
// that was still alive but slow (e.g. a 6-second write under
// contention) was therefore reported as a livelock even though the
// mutex itself considered it live. Tie the threshold to the
// heartbeat: a holder is only "stuck" after going two full
// heartbeats without progress, which the heartbeat would have
// refreshed at the next tick. When `mutexStaleMs` is not configured,
// fall back to a safe default of 30s (matches withFileMutex's
// `staleMs ?? 30_000`).
export const livelockThresholdMs = (deps: IAgentLockDeps): number => {
	const staleMs = deps.mutexStaleMs ?? 30_000;
	const heartbeatMs = Math.max(50, Math.floor(staleMs / 3));
	return 2 * heartbeatMs;
};

export const resolveTrackedContentions = async (
	filters: {
		waitingTaskId?: string;
		holderTaskId?: string;
		holderAgentId?: string;
		files?: readonly string[];
	},
	deps: IAgentLockDeps,
): Promise<void> => {
	await resolveFileLockContentions({
		...filters,
		...getFileLockDeps(deps),
	});
};

export const maybeEscalateContention = async (params: {
	readonly taskId: string;
	readonly agent: string;
	readonly conflictingTaskId?: string;
	readonly conflictingAgent: string;
	readonly files: readonly string[];
	readonly toolName: string;
	readonly lockFileLabel: string;
	readonly lockPath: string;
	readonly deps: IAgentLockDeps;
}): Promise<IAgentLockResponse | null> => {
	const contention = await noteFileLockContention({
		kind: 'disjoint',
		waitingTaskId: params.taskId,
		waitingAgentId: params.agent,
		holderAgentId: params.conflictingAgent,
		files: params.files,
		...(params.conflictingTaskId !== undefined
			? { holderTaskId: params.conflictingTaskId }
			: {}),
		...getFileLockDeps(params.deps),
	});
	if (contention.heldMs <= livelockThresholdMs(params.deps)) return null;
	return lockResult(
		{
			tool: params.toolName,
			action: 'claim',
			task_id: params.taskId,
			agent: params.agent,
			blocked: true,
			blockerType: 'livelock-error',
			reason: 'contention-exceeded-threshold',
			path: params.lockFileLabel,
			lock_path: params.lockPath,
			conflicting_agent: params.conflictingAgent,
			...(params.conflictingTaskId !== undefined
				? { conflicting_task: params.conflictingTaskId }
				: {}),
			overlapping_files: [...params.files],
			held_ms: contention.heldMs,
			error: {
				reason: 'livelock-error',
				nextAction: LIVELOCK_NEXT,
			},
			nextAction: LIVELOCK_NEXT,
			summary: `livelock-error: ${params.taskId} stayed blocked for ${contention.heldMs}ms`,
		},
		{ isError: true },
	);
};

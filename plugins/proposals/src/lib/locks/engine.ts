/**
 * agent-lock-engine.ts (moved from the host project)
 *
 * File-level write-ownership mutex with stale-claim GC: claim before
 * editing, release after editing, status/gc for stale claims. The
 * host injects its tool name (used in payloads), the workspace-
 * relative label, and the lock path; defaults come from
 * `DEFAULT_PATH_LAYOUT`.
 */

import { mkdir, readdir, rm, stat } from 'node:fs/promises';
import { hostname } from 'node:os';
import { basename, dirname, join } from 'node:path';

import {
	LockContentionError,
	SafeWorkspaceReader,
	writeFileAtomic,
	withFileMutex,
} from '@delendai/core/public';

import { DEFAULT_PATH_LAYOUT } from '../contracts/constants/default-path-layout.constant';
import { RELEASE_AUDIT_LOG_RELATIVE_PATH } from '../contracts/constants/agents-lock.constants';
import {
	addFileLocks,
	deriveFileLockTablePath,
	findConflictingLocks,
	noteFileLockContention,
	removeFileLocksForTask,
	resolveFileLockContentions,
	tryAcquireFileLocks,
} from './file-lock-table';
import { isLockEntryStale } from '../shared/purge-stale-locks';
import {
	defaultLivenessProbe,
	isLockEntryOrphaned,
	type ILockLivenessProbe,
} from './orphaned-lock';
import {
	appendSessionEntry,
	readSessionBalance,
	resetSessionBalance,
	type ISessionBalance,
} from './agent-lock-session-store';

// r00042 S3: the vocabulary moved to contracts/interfaces; re-exported
// here so no importer of `engine.ts` had to change.
export type {
	IAgentLockAction,
	IAgentLockArgs,
	IAgentLockDeps,
	IAgentLockResponse,
	IAgentLockTmpFileInfo,
	ILockEntry,
	ILockFile,
	IReleaseAuditEntry,
} from '../contracts/interfaces/agent-lock.interface';

// r00042 S3 — the engine was split into cohesive modules; every symbol it
// used to export is re-exported here so no importer had to change. The
// split moved declarations verbatim, which is what makes that promise
// safe to make.
export {
	getAgentLockSessionBalance,
	resetAgentLockSessionBalance,
} from './session-balance';
export {
	AGENT_LOCK_TMP_STALE_MS,
	listStaleAgentLockTmpFiles,
	sweepStaleAgentLockTmpFiles,
} from './tmp-file-sweeper';
export { readLock, removeStale } from './lock-store';
export {
	cleanupStaleAgentLockState,
	releaseAgentSessionClaims,
} from './lock-lifecycle';
export { claimWithFileLocks } from './claim-with-file-locks';

import type {
	IAgentLockArgs,
	IAgentLockDeps,
	IAgentLockResponse,
	IAgentLockTmpFileInfo,
	ILockEntry,
	ILockFile,
	IReleaseAuditEntry,
} from '../contracts/interfaces/agent-lock.interface';

export async function runAgentLockEngine(
	args: IAgentLockArgs,
	deps: IAgentLockDeps = {},
): Promise<IAgentLockResponse> {
	lastSessionWorkspaceRoot = resolveSessionWorkspaceRoot(deps);
	const v = validateArgs(args);
	const toolName = getToolName(deps);
	const lockFileLabel = getLockFileLabel(deps);
	if (!v.ok) {
		return lockResult(
			{
				tool: toolName,
				action: args.action,
				path: lockFileLabel,
				error: v.error,
				blockerType: 'invalid-input',
				nextAction:
					'Correct the missing lock arguments once; if the intended files are unclear, inspect the proposal ownership before retrying.',
				summary: `invalid-input: ${v.error}`,
			},
			{ isError: true },
		);
	}

	if (args.action === 'claim' && deps.agentWorktreeEnabled === true) {
		const branch = await readCurrentBranchName(deps);
		if (branch === null) {
			return lockResult(
				{
					tool: toolName,
					action: args.action,
					path: lockFileLabel,
					error: 'agent_lock claim requires a per-agent worktree when the host gate is on, but the active branch could not be read',
					blockerType: 'needs-worktree',
					nextAction:
						'proposals_agent_worktree { action: "create", agent: "<your-agent-name>" } and retry the claim.',
					summary:
						'needs-worktree: active branch unreadable; create a worktree first',
				},
				{ isError: true },
			);
		}
		if (!isAgentBranchName(branch)) {
			return lockResult(
				{
					tool: toolName,
					action: args.action,
					path: lockFileLabel,
					activeBranch: branch,
					error: `agent_lock claim requires a per-agent worktree when the host gate is on; active branch is "${branch}", expected "agent/<name>"`,
					blockerType: 'needs-worktree',
					nextAction:
						'proposals_agent_worktree { action: "create", agent: "<your-agent-name>" } and retry the claim.',
					summary: `needs-worktree: active branch is "${branch}"`,
				},
				{ isError: true },
			);
		}
	}

	if (args.action === 'status') {
		return applyPersistedSessionBalance(
			await executeLockAction(args, deps),
			args,
			deps,
		);
	}

	try {
		return await applyPersistedSessionBalance(
			await withFileMutex(
				getFileLockTablePath(deps),
				() => executeLockAction(args, deps),
				getMutexOptions(args, deps),
			),
			args,
			deps,
		);
	} catch (error) {
		if (error instanceof LockContentionError) {
			return lockResult(
				{
					tool: toolName,
					action: args.action,
					path: lockFileLabel,
					error: error.message,
					blockerType: 'lock-contention',
					nextAction: CONTENTION_NEXT,
					summary: `lock-contention: ${error.message}`,
				},
				{ isError: true },
			);
		}
		throw error;
	}
}

async function executeLockAction(
	args: IAgentLockArgs,
	deps: IAgentLockDeps,
): Promise<IAgentLockResponse> {
	const lockPath = getLockPath(deps);
	const toolName = getToolName(deps);
	const lockFileLabel = getLockFileLabel(deps);
	const tablePath = getFileLockTablePath(deps);

	if (args.action === 'claim') {
		const lock = await readSynchronizedLock(deps);
		const taskId = args.task_id as string;
		const agent = args.agent as string;
		const files = [...new Set(args.files as string[])].sort();
		const now = getNow(deps);

		const existing = lock.in_flight.find(
			(entry) => entry.task_id === taskId,
		);
		if (existing !== undefined) {
			existing.last_seen = now;
			const owned = new Set(existing.ownership);
			const candidate = files.filter((file) => !owned.has(file));
			const conflicts = (
				await findConflictingLocks(taskId, candidate, {
					...(tablePath !== undefined ? { tablePath } : {}),
				})
			).filter((entry) => entry.taskId !== taskId);
			const conflictMap = new Map(
				conflicts.map((entry) => [entry.file, entry] as const),
			);
			const notGranted = candidate
				.filter((file) => conflictMap.has(file))
				.map((file) => ({
					file,
					conflicting_task: conflictMap.get(file)!.taskId,
				}));
			const added = candidate.filter((file) => !conflictMap.has(file));
			if (added.length > 0) {
				existing.ownership.push(...added);
				existing.ownership.sort();
			}
			await removeFileLocksForTask({ taskId, tablePath });
			await addFileLocks({
				agentId: agent,
				files: existing.ownership,
				taskId,
				now: () => now,
				...(tablePath !== undefined ? { tablePath } : {}),
			});
			await resolveTrackedContentions({ waitingTaskId: taskId }, deps);
			await writeLockWithMutex(lock, args, deps);
			const partial = notGranted.length > 0;
			return lockResult({
				tool: toolName,
				action: 'claim',
				task_id: taskId,
				refreshed: true,
				path: lockFileLabel,
				lock_path: lockPath,
				heldFiles: [...existing.ownership].sort(),
				ownership_count: existing.ownership.length,
				...(added.length > 0 ? { added_files: added } : {}),
				...(partial ? { not_granted: notGranted, blocked: true } : {}),
				summary: partial
					? `refreshed ${taskId}; ${notGranted.length} file(s) not granted (owned by another task)`
					: `refreshed ${taskId}`,
				...(partial
					? {
							blockerType: 'lock-conflict',
							nextAction: CONTENTION_NEXT,
						}
					: {}),
			});
		}

		for (const entry of lock.in_flight) {
			const overlap = findOverlap(files, entry.ownership);
			if (overlap.length === 0) continue;
			const livelock = await maybeEscalateContention({
				taskId,
				agent,
				conflictingTaskId: entry.task_id,
				conflictingAgent: entry.agent,
				files: overlap,
				toolName,
				lockFileLabel,
				lockPath,
				deps,
			});
			if (livelock !== null) return livelock;
			return lockResult({
				tool: toolName,
				action: 'claim',
				task_id: taskId,
				blocked: true,
				blockerType: 'lock-conflict',
				blocked_reason: `overlaps with ${entry.task_id}`,
				conflicting_task: entry.task_id,
				conflicting_agent: entry.agent,
				overlapping_files: overlap,
				path: lockFileLabel,
				lock_path: lockPath,
				nextAction: CONTENTION_NEXT,
				summary: `lock-conflict: ${taskId} overlaps ${entry.task_id}`,
			});
		}

		const conflicts = await findConflictingLocks(taskId, files, {
			...(tablePath !== undefined ? { tablePath } : {}),
		});
		if (conflicts.length > 0) {
			const conflictMap = new Map(
				conflicts.map((entry) => [entry.file, entry] as const),
			);
			const overlappingFiles = files.filter((file) =>
				conflictMap.has(file),
			);
			const firstConflict = conflicts[0]!;
			const livelock = await maybeEscalateContention({
				taskId,
				agent,
				conflictingTaskId: firstConflict.taskId,
				conflictingAgent: firstConflict.agent,
				files: overlappingFiles,
				toolName,
				lockFileLabel,
				lockPath,
				deps,
			});
			if (livelock !== null) return livelock;
			return lockResult({
				tool: toolName,
				action: 'claim',
				task_id: taskId,
				blocked: true,
				blockerType: 'lock-conflict',
				blocked_reason: `overlaps with ${conflicts[0]!.taskId}`,
				conflicting_task: conflicts[0]!.taskId,
				conflicting_agent: conflicts[0]!.agent,
				overlapping_files: overlappingFiles,
				not_granted: overlappingFiles.map((file) => ({
					file,
					conflicting_task: conflictMap.get(file)!.taskId,
				})),
				path: lockFileLabel,
				lock_path: lockPath,
				nextAction: CONTENTION_NEXT,
				summary: `lock-conflict: ${taskId} overlaps ${conflicts[0]!.taskId}`,
			});
		}

		const acquired = await tryAcquireFileLocks({
			agentId: agent,
			files,
			taskId,
			now: () => now,
			...(tablePath !== undefined ? { tablePath } : {}),
		});
		if (!acquired.ok) {
			return lockResult({
				tool: toolName,
				action: 'claim',
				task_id: taskId,
				blocked: true,
				blockerType: 'lock-conflict',
				blocked_reason: `file lock held by ${acquired.heldBy}`,
				conflicting_agent: acquired.heldBy,
				...(acquired.heldTaskId !== undefined
					? { conflicting_task: acquired.heldTaskId }
					: {}),
				overlapping_files: [acquired.conflictOn],
				path: lockFileLabel,
				lock_path: lockPath,
				nextAction: CONTENTION_NEXT,
				summary: `lock-conflict: ${taskId} overlaps file lock ${acquired.conflictOn}`,
			});
		}
		// x00155 S2 / x00153 S5 — stamp (host, pid) on the new
		// in_flight entry so a later release can detect a host
		// restart. The release handler treats a pid mismatch as a
		// "host-restart cleanup" and writes an audit line.
		const caller = resolveCallerHostId(deps);
		lock.in_flight.push({
			task_id: taskId,
			agent,
			ownership: files,
			started_at: now,
			last_seen: now,
			host: caller.host,
			pid: caller.pid,
			...(args.parent_task_id !== undefined
				? { parent_task_id: args.parent_task_id }
				: {}),
		});
		await resolveTrackedContentions({ waitingTaskId: taskId }, deps);
		await writeLockWithMutex(lock, args, deps);
		return lockResult({
			tool: toolName,
			action: 'claim',
			task_id: taskId,
			agent,
			path: lockFileLabel,
			lock_path: lockPath,
			heldFiles: files,
			ownership_count: files.length,
			claimed: true,
			summary: `claimed ${taskId} (${files.length} files)`,
		});
	}

	if (args.action === 'release') {
		const lock = await readSynchronizedLock(deps);
		const taskId = args.task_id as string;
		const existing = lock.in_flight.find(
			(entry) => entry.task_id === taskId,
		);

		// x00155 S2 / x00153 S5 — caller-host awareness. When the
		// recorded (host, pid) on the in_flight entry differs from
		// the live caller's (host, pid), the original process is
		// dead (host restart, MCP server crash, swap to a different
		// shell). The new caller is the same agent by name — and is
		// the legitimate release path — so we force-release and write
		// a JSONL audit line under
		// `.cache/delendai/agents.lock.releases.jsonl`.
		const caller = resolveCallerHostId(deps);

		// (1) Agent-name check. If the caller explicitly identifies
		// itself as a different agent than the recorded holder, we
		// refuse — the agent name is the stable identity across
		// process restarts, so a mismatch means a different agent
		// is trying to release someone else's claim. When the
		// caller omits `agent`, we keep the pre-fix behaviour and
		// skip the identity check.
		if (
			existing !== undefined &&
			typeof args.agent === 'string' &&
			args.agent !== existing.agent
		) {
			return lockResult(
				{
					tool: toolName,
					action: 'release',
					task_id: taskId,
					agent: existing.agent,
					path: lockFileLabel,
					lock_path: lockPath,
					error: `release refused: caller agent "${args.agent}" does not match the recorded holder agent "${existing.agent}"`,
					blockerType: 'invalid-input',
					nextAction:
						'Pass the agent name that originally claimed the lock, or omit the agent arg to use the recorded holder.',
					summary: `release refused: agent mismatch for ${taskId}`,
				},
				{ isError: true },
			);
		}

		// (2) Pid mismatch detection. The recorded entry is from a
		// dead process when pid is set on the entry AND pid does not
		// match the live caller. (Entries without pid pre-date the
		// tracking and are released normally — the caller's choice.)
		const isCrossProcess =
			existing !== undefined &&
			typeof existing.pid === 'number' &&
			existing.pid !== caller.pid;

		await removeFileLocksForTask({ taskId, tablePath });
		if (existing !== undefined) {
			await resolveTrackedContentions(
				{ holderTaskId: taskId, holderAgentId: existing.agent },
				deps,
			);
		}
		const before = lock.in_flight.length;
		lock.in_flight = lock.in_flight.filter(
			(entry) => entry.task_id !== taskId,
		);
		const dropped = before - lock.in_flight.length;
		await writeLockWithMutex(lock, args, deps);

		// (3) Audit log. Only when the entry was actually removed AND
		// we detected a host/pid mismatch — the audit line is the
		// operator's signal that a host restart reclaimed a claim.
		if (isCrossProcess && dropped > 0 && existing !== undefined) {
			await appendReleaseAuditEntry(
				{
					task_id: taskId,
					agent: existing.agent,
					originalHost: existing.host,
					originalPid: existing.pid,
					releasingHost: caller.host,
					releasingPid: caller.pid,
					ts: getNow(deps),
					reason: 'cross-process release',
				},
				resolveSessionWorkspaceRoot(deps),
			);
		}

		return lockResult({
			tool: toolName,
			action: 'release',
			task_id: taskId,
			...(existing !== undefined ? { agent: existing.agent } : {}),
			...(isCrossProcess ? { cross_process_release: true } : {}),
			...(isCrossProcess && existing !== undefined
				? { original_pid: existing.pid }
				: {}),
			path: lockFileLabel,
			lock_path: lockPath,
			removed: dropped,
			released: dropped > 0,
			summary:
				dropped > 0
					? isCrossProcess
						? `released ${taskId} (cross-process; original pid ${existing?.pid} → releasing pid ${caller.pid})`
						: `released ${taskId}`
					: `no active claim for ${taskId}`,
		});
	}

	if (args.action === 'status') {
		const lock = await readLock(deps);
		return lockResult({
			tool: toolName,
			action: 'status',
			path: lockFileLabel,
			lock_path: lockPath,
			exists: await fileExists(lockPath),
			active_write_lanes: lock.in_flight.length,
			summary: `${lock.in_flight.length} active write lane(s)`,
			...lock,
		});
	}

	if (args.action === 'heartbeat') {
		const lock = await readSynchronizedLock(deps);
		const taskId = args.task_id as string;
		const agent = args.agent as string;
		const existing = lock.in_flight.find(
			(entry) => entry.task_id === taskId,
		);
		if (existing === undefined) {
			return lockResult(
				{
					tool: toolName,
					action: 'heartbeat',
					task_id: taskId,
					agent,
					path: lockFileLabel,
					lock_path: lockPath,
					error: `heartbeat refused: no active claim for ${taskId}`,
					blockerType: 'invalid-input',
					nextAction:
						'Claim the files first, then send periodic heartbeats while working.',
					summary: `heartbeat refused: no active claim for ${taskId}`,
				},
				{ isError: true },
			);
		}
		if (existing.agent !== agent) {
			return lockResult(
				{
					tool: toolName,
					action: 'heartbeat',
					task_id: taskId,
					agent,
					path: lockFileLabel,
					lock_path: lockPath,
					error: `heartbeat refused: caller agent "${agent}" does not match the recorded holder agent "${existing.agent}"`,
					blockerType: 'invalid-input',
					nextAction:
						'Use the agent name that originally claimed the lock.',
					summary: `heartbeat refused: agent mismatch for ${taskId}`,
				},
				{ isError: true },
			);
		}
		existing.last_seen = getNow(deps);
		await writeLockWithMutex(lock, args, deps);
		return lockResult({
			tool: toolName,
			action: 'heartbeat',
			task_id: taskId,
			agent,
			path: lockFileLabel,
			lock_path: lockPath,
			refreshed: true,
			last_seen: existing.last_seen,
			summary: `heartbeat refreshed ${taskId}`,
		});
	}

	if (args.action === 'gc') {
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
		await pruneFileLocksForTasks(staleTaskIds, deps);
		const dropped = raw.in_flight.length - cleaned.in_flight.length;
		await writeLockWithMutex(cleaned, args, deps);
		await sweepStaleAgentLockTmpFiles(lockPath);
		return lockResult({
			tool: toolName,
			action: 'gc',
			path: lockFileLabel,
			lock_path: lockPath,
			dropped,
			summary: `gc dropped ${dropped} stale claim(s)`,
		});
	}

	return lockResult({ error: 'unreachable' }, { isError: true });
}

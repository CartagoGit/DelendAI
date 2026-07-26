/**
 * agent-lock-engine.ts (moved from the host project)
 *
 * File-level write-ownership mutex with stale-claim GC: claim before
 * editing, release after editing, status/gc for stale claims. The
 * host injects its tool name (used in payloads), the workspace-
 * relative label, and the lock path; defaults come from
 * `DEFAULT_PATH_LAYOUT`.
 */

import { readFile, readdir, rm, stat } from 'node:fs/promises';
import { basename, dirname, join } from 'node:path';

import {
	LockContentionError,
	writeFileAtomic,
	withFileMutex,
} from '@mcp-vertex/core/public';

import { DEFAULT_PATH_LAYOUT } from '../contracts/constants/default-path-layout.constant';
import {
	addFileLocks,
	deriveFileLockTablePath,
	findConflictingLocks,
	noteFileLockContention,
	readFileLockEntries,
	removeFileLocksForTask,
	resolveFileLockContentions,
	tryAcquireFileLocks,
} from './file-lock-table';
import { isLockEntryStale } from '../shared/purge-stale-locks';
import {
	appendSessionEntry,
	readSessionBalance,
	readSessionBalanceSync,
	resetSessionBalance,
	type ISessionBalance,
} from './agent-lock-session-store';

export type IAgentLockAction = 'claim' | 'release' | 'status' | 'gc';

export type IAgentLockArgs = {
	action: IAgentLockAction;
	task_id?: string | undefined;
	agent?: string | undefined;
	files?: string[] | undefined;
	parent_task_id?: string | undefined;
	/**
	 * What `withFileMutex` should do when a **live** holder keeps the lock
	 * file past its contention timeout: `'steal'` (default) reclaims
	 * it as before; `'fail'` rejects instead of clobbering a slow-but-alive
	 * holder. Forwarded as-is — see `IFileMutexOptions.onContention`.
	 */
	onContention?: 'steal' | 'fail' | undefined;
};

export type ILockEntry = {
	task_id: string;
	agent: string;
	ownership: string[];
	started_at: string;
	last_seen: string;
	parent_task_id?: string;
};

export type ILockFile = {
	$schema?: string;
	description?: string;
	version: number;
	stale_after_minutes: number;
	in_flight: ILockEntry[];
};

export interface IAgentLockTmpFileInfo {
	readonly absPath: string;
	readonly relName: string;
	readonly mtime: string;
	readonly ageSeconds: number;
}

export type IAgentLockDeps = {
	lockPath?: string;
	now?: () => string;
	toolName?: string;
	lockFileLabel?: string;
	mutexTimeoutMs?: number;
	mutexStaleMs?: number;
	mutexPollMs?: number;
	fileLockTablePath?: string;
	agentWorktreeEnabled?: boolean;
	currentBranchOverride?: string;
};

export type IAgentLockResponse = {
	content: Array<{ type: 'text'; text: string }>;
	isError?: boolean;
};

let lastSessionWorkspaceRoot: string | undefined;
let lastKnownSessionBalance: ISessionBalance = {
	claims: 0,
	releases: 0,
	imbalance: 0,
};

export const getAgentLockSessionBalance = (): {
	readonly claims: number;
	readonly releases: number;
	readonly imbalance: number;
} => {
	lastKnownSessionBalance = readSessionBalanceSync(lastSessionWorkspaceRoot);
	return lastKnownSessionBalance;
};

export const resetAgentLockSessionBalance = (): void => {
	lastKnownSessionBalance = { claims: 0, releases: 0, imbalance: 0 };
	resetSessionBalance();
};

const resolveSessionWorkspaceRoot = (deps: IAgentLockDeps): string | undefined => {
	if (!deps.lockPath) return undefined;
	const parent = dirname(deps.lockPath);
	return basename(parent) === '.cache' ? dirname(parent) : parent;
};

const CONTENTION_NEXT =
	'Do not busy-poll agent_lock status. Call notification_await_lock (or wait for a lock-released notification via notify_status), then retry the claim once ownership is free.';

const LIVELOCK_THRESHOLD_MS = 5_000;
const LIVELOCK_NEXT =
	'Run proposals_state_health to inspect livelockPairs, then clear the stale file-lock state before retrying this claim.';

export const AGENT_LOCK_TMP_STALE_MS = 60_000;

const EMPTY_LOCK = (): ILockFile => ({
	version: 1,
	stale_after_minutes: 10,
	in_flight: [],
});

const isAgentLockTmpFile = (lockPath: string, candidate: string): boolean => {
	const expectedPrefix = `${basename(lockPath)}.`;
	return candidate.startsWith(expectedPrefix) && candidate.endsWith('.tmp');
};

const lockResult = (
	payload: Record<string, unknown>,
	opts: {
		isError?: boolean;
		balance?: ISessionBalance;
	} = {},
): IAgentLockResponse => {
	const blocked = payload.blocked === true;
	const isError = opts.isError === true;
	const ok = !isError && !blocked;
	const balance = opts.balance ?? lastKnownSessionBalance;
	const body = {
		...payload,
		ok,
		session: {
			claims: balance.claims,
			releases: balance.releases,
			imbalance: balance.imbalance,
		},
	};
	return {
		content: [{ type: 'text', text: JSON.stringify(body) }],
		...(isError ? { isError: true } : {}),
	};
};

const replaceSessionBalance = (
	response: IAgentLockResponse,
	balance: ISessionBalance,
): IAgentLockResponse => {
	const raw = response.content[0]?.text;
	if (typeof raw !== 'string') return response;
	try {
		const parsed = JSON.parse(raw) as Record<string, unknown>;
		return {
			...response,
			content: [
				{
					type: 'text',
					text: JSON.stringify({
						...parsed,
						session: {
							claims: balance.claims,
							releases: balance.releases,
							imbalance: balance.imbalance,
						},
					}),
				},
			],
		};
	} catch {
		return response;
	}
};

const applyPersistedSessionBalance = async (
	response: IAgentLockResponse,
	args: IAgentLockArgs,
	deps: IAgentLockDeps,
): Promise<IAgentLockResponse> => {
	const workspaceRoot = resolveSessionWorkspaceRoot(deps);
	const raw = response.content[0]?.text;
	if (typeof raw !== 'string') return response;
	let payload: Record<string, unknown>;
	try {
		payload = JSON.parse(raw) as Record<string, unknown>;
	} catch {
		return response;
	}
	if (args.action === 'claim' && payload.claimed === true && payload.ok === true) {
		await appendSessionEntry(
			{
				ts: getNow(deps),
				agent: String(payload.agent ?? args.agent ?? ''),
				action: 'claim',
				ok: true,
			},
			workspaceRoot,
		);
	}
	if (
		args.action === 'release' &&
		payload.released === true &&
		payload.ok === true
	) {
		await appendSessionEntry(
			{
				ts: getNow(deps),
				agent: String(payload.agent ?? 'unknown'),
				action: 'release',
				ok: true,
			},
			workspaceRoot,
		);
	}
	lastKnownSessionBalance = await readSessionBalance(workspaceRoot);
	return replaceSessionBalance(response, lastKnownSessionBalance);
};

const getLockPath = (deps: IAgentLockDeps = {}): string => {
	if (!deps.lockPath) {
		throw new Error(
			'agent-lock: deps.lockPath is required — inject the absolute lock path resolved from ctx.workspace.',
		);
	}
	return deps.lockPath;
};

const getToolName = (deps: IAgentLockDeps = {}): string =>
	deps.toolName ?? 'agent_lock';

const getLockFileLabel = (deps: IAgentLockDeps = {}): string =>
	deps.lockFileLabel ?? DEFAULT_PATH_LAYOUT.lockFile;

const getNow = (deps: IAgentLockDeps = {}): string =>
	(deps.now ?? (() => new Date().toISOString()))();

const getFileLockTablePath = (deps: IAgentLockDeps = {}): string =>
	deriveFileLockTablePath(getLockPath(deps), deps.fileLockTablePath);

const getMutexOptions = (
	args: Pick<IAgentLockArgs, 'onContention'>,
	deps: IAgentLockDeps,
): {
	onContention?: 'steal' | 'fail';
	timeoutMs?: number;
	staleMs?: number;
	pollMs?: number;
} => ({
	...(args.onContention !== undefined
		? { onContention: args.onContention }
		: {}),
	...(deps.mutexTimeoutMs !== undefined
		? { timeoutMs: deps.mutexTimeoutMs }
		: {}),
	...(deps.mutexStaleMs !== undefined ? { staleMs: deps.mutexStaleMs } : {}),
	...(deps.mutexPollMs !== undefined ? { pollMs: deps.mutexPollMs } : {}),
});

const readCurrentBranchName = async (
	deps: IAgentLockDeps,
): Promise<string | null> => {
	if (deps.currentBranchOverride !== undefined) {
		return deps.currentBranchOverride;
	}
	try {
		const { execFile } = await import('node:child_process');
		return await new Promise<string | null>((resolve) => {
			if (!deps.lockPath) {
				resolve(null);
				return;
			}
			const cwd = deps.lockPath.replace(/\/[^/]+$/u, '');
			execFile(
				'git',
				['rev-parse', '--abbrev-ref', 'HEAD'],
				{ cwd, encoding: 'utf8', timeout: 5_000 },
				(error, stdout) => {
					if (error) {
						resolve(null);
						return;
					}
					const branch = stdout.trim();
					resolve(branch.length === 0 ? 'HEAD' : branch);
				},
			);
		});
	} catch {
		return null;
	}
};

const isAgentBranchName = (branch: string): boolean =>
	branch.startsWith('agent/') && branch.length > 'agent/'.length;

const fileExists = async (path: string): Promise<boolean> => {
	try {
		await stat(path);
		return true;
	} catch {
		return false;
	}
};

export const listStaleAgentLockTmpFiles = async (
	lockPath: string,
	staleMs = AGENT_LOCK_TMP_STALE_MS,
): Promise<readonly IAgentLockTmpFileInfo[]> => {
	const dir = dirname(lockPath);
	const nowMs = Date.now();
	const entries = await readdir(dir, { withFileTypes: true }).catch(() => []);
	const staleTmpFiles: IAgentLockTmpFileInfo[] = [];
	for (const entry of entries) {
		if (!entry.isFile()) continue;
		if (!isAgentLockTmpFile(lockPath, entry.name)) continue;
		const absPath = join(dir, entry.name);
		const info = await stat(absPath).catch(() => null);
		if (info === null) continue;
		const ageMs = nowMs - info.mtimeMs;
		if (ageMs <= staleMs) continue;
		staleTmpFiles.push({
			absPath,
			relName: entry.name,
			mtime: info.mtime.toISOString(),
			ageSeconds: Math.floor(ageMs / 1000),
		});
	}
	staleTmpFiles.sort((a, b) => a.absPath.localeCompare(b.absPath));
	return staleTmpFiles;
};

export const sweepStaleAgentLockTmpFiles = async (
	lockPath: string,
	staleMs = AGENT_LOCK_TMP_STALE_MS,
): Promise<readonly IAgentLockTmpFileInfo[]> => {
	const staleTmpFiles = await listStaleAgentLockTmpFiles(lockPath, staleMs);
	for (const tmpFile of staleTmpFiles) {
		await rm(tmpFile.absPath, { force: true }).catch(() => undefined);
	}
	return staleTmpFiles;
};

const loadLock = async (deps: IAgentLockDeps = {}): Promise<ILockFile> => {
	const lockPath = getLockPath(deps);
	let raw: string;
	try {
		raw = await readFile(lockPath, 'utf8');
	} catch {
		return EMPTY_LOCK();
	}
	const parsed = JSON.parse(raw) as ILockFile;
	if (!Array.isArray(parsed.in_flight)) parsed.in_flight = [];
	return parsed;
};

const writeLock = async (
	lock: ILockFile,
	deps: IAgentLockDeps = {},
): Promise<void> => {
	const lockPath = getLockPath(deps);
	await writeFileAtomic(lockPath, `${JSON.stringify(lock, null, '\t')}\n`);
};

export const removeStale = (lock: ILockFile): ILockFile => ({
	...lock,
	in_flight: lock.in_flight.filter(
		(entry) => !isLockEntryStale(entry, lock.stale_after_minutes),
	),
});

const pruneFileLocksForTasks = async (
	taskIds: readonly string[],
	deps: IAgentLockDeps,
): Promise<void> => {
	const tablePath = getFileLockTablePath(deps);
	for (const taskId of taskIds) {
		await removeFileLocksForTask({ taskId, tablePath });
	}
};

const getFileLockDeps = (
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

const writeLockWithMutex = async (
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

const resolveTrackedContentions = async (
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

const maybeEscalateContention = async (params: {
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
	if (contention.heldMs <= LIVELOCK_THRESHOLD_MS) return null;
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

const readSynchronizedLock = async (
	deps: IAgentLockDeps,
): Promise<ILockFile> => {
	const raw = await loadLock(deps);
	const cleaned = removeStale(raw);
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

const findOverlap = (a: string[], b: string[]): string[] => {
	const setB = new Set(b);
	return a.filter((path) => setB.has(path));
};

const validateArgs = (
	args: IAgentLockArgs,
): { ok: true; value: IAgentLockArgs } | { ok: false; error: string } => {
	if (args.action === 'claim') {
		if (!args.task_id || !args.agent) {
			return { ok: false, error: 'claim requires task_id and agent' };
		}
		if (!Array.isArray(args.files) || args.files.length === 0) {
			return {
				ok: false,
				error: 'claim requires a non-empty files[] array',
			};
		}
	}
	if (args.action === 'release' && !args.task_id) {
		return { ok: false, error: 'release requires task_id' };
	}
	return { ok: true, value: args };
};

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

export const claimWithFileLocks = async (
	args: {
		readonly taskId: string;
		readonly agentId: string;
		readonly files: readonly string[];
		readonly parentTaskId?: string;
		readonly onContention?: 'steal' | 'fail';
	},
	deps: IAgentLockDeps = {},
): Promise<IAgentLockResponse> =>
	runAgentLockEngine(
		{
			action: 'claim',
			task_id: args.taskId,
			agent: args.agentId,
			files: [...args.files],
			...(args.parentTaskId !== undefined
				? { parent_task_id: args.parentTaskId }
				: {}),
			...(args.onContention !== undefined
				? { onContention: args.onContention }
				: {}),
		},
		deps,
	);

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
		const tableEntries = await readFileLockEntries({ tablePath });

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
		lock.in_flight.push({
			task_id: taskId,
			agent,
			ownership: files,
			started_at: now,
			last_seen: now,
			...(args.parent_task_id !== undefined
				? { parent_task_id: args.parent_task_id }
				: {}),
		});
		await resolveTrackedContentions({ waitingTaskId: taskId }, deps);
		await writeLockWithMutex(lock, args, deps);
		return lockResult(
			{
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
			},
		);
	}

	if (args.action === 'release') {
		const lock = await readSynchronizedLock(deps);
		const taskId = args.task_id as string;
		const existing = lock.in_flight.find(
			(entry) => entry.task_id === taskId,
		);
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
		return lockResult(
			{
				tool: toolName,
				action: 'release',
				task_id: taskId,
				...(existing !== undefined ? { agent: existing.agent } : {}),
				path: lockFileLabel,
				lock_path: lockPath,
				removed: dropped,
				released: dropped > 0,
				summary:
					dropped > 0
						? `released ${taskId}`
						: `no active claim for ${taskId}`,
				},
		);
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

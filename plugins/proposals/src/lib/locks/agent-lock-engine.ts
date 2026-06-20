/**
 * agent-lock-engine.ts (moved from the host project)
 *
 * File-level write-ownership mutex with stale-claim GC: claim before
 * editing, release after editing, status/gc for stale claims. The
 * host injects its tool name (used in payloads), the workspace-
 * relative label, and the lock path; defaults come from
 * `DEFAULT_PATH_LAYOUT`.
 */

import { readFile, stat } from 'node:fs/promises';

import {
	LockContentionError,
	toolError,
	writeFileAtomic,
	withFileMutex,
} from '@mcp-vertex/core/public';

import { DEFAULT_PATH_LAYOUT } from '../contracts/constants/default-path-layout.constant';

export type IAgentLockAction = 'claim' | 'release' | 'status' | 'gc';

export type IAgentLockArgs = {
	action: IAgentLockAction;
	task_id?: string | undefined;
	agent?: string | undefined;
	files?: string[] | undefined;
	parent_task_id?: string | undefined;
	/**
	 * What `withFileMutex` should do when a **live** holder keeps the lock
	 * file past its contention timeout (M28): `'steal'` (default) reclaims
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

export type IAgentLockDeps = {
	lockPath?: string;
	now?: () => string;
	/** Tool name echoed in payloads (host injects e.g. `<prefix>_agent_lock`). */
	toolName?: string;
	/** Workspace-relative label echoed in payloads. */
	lockFileLabel?: string;
	/**
	 * Internal `withFileMutex` timing overrides — NOT exposed on the tool's
	 * inputSchema. Tests use these to exercise contention paths (M28)
	 * without waiting out the production timeouts.
	 */
	mutexTimeoutMs?: number;
	mutexStaleMs?: number;
	mutexPollMs?: number;
};

export type IAgentLockResponse = {
	content: Array<{ type: 'text'; text: string }>;
	isError?: boolean;
};

const getLockPath = (deps: IAgentLockDeps = {}): string => {
	// Hermetic: the absolute lock path must be injected from the host's
	// `ctx.workspace`. No `process.cwd()` fallback — an engine never guesses
	// where the workspace is. [N6]
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

/** Async existence check (H2): never blocks the event loop. */
const fileExists = async (path: string): Promise<boolean> => {
	try {
		await stat(path);
		return true;
	} catch {
		return false;
	}
};

const readLock = async (deps: IAgentLockDeps = {}): Promise<ILockFile> => {
	const lockPath = getLockPath(deps);
	let raw: string;
	try {
		raw = await readFile(lockPath, 'utf8');
	} catch {
		return { version: 1, stale_after_minutes: 10, in_flight: [] };
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

const isStale = (e: ILockEntry, thresholdMinutes: number): boolean => {
	const t = new Date(e.last_seen).getTime();
	if (Number.isNaN(t)) return true;
	return Date.now() - t > thresholdMinutes * 60_000;
};

const removeStale = (lock: ILockFile): ILockFile => {
	lock.in_flight = lock.in_flight.filter(
		(e) => !isStale(e, lock.stale_after_minutes),
	);
	return lock;
};

const findOverlap = (a: string[], b: string[]): string[] => {
	const setB = new Set(b);
	return a.filter((p) => setB.has(p));
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
	if (args.action === 'release') {
		if (!args.task_id) {
			return { ok: false, error: 'release requires task_id' };
		}
	}
	return { ok: true, value: args };
};

export async function runAgentLockEngine(
	args: IAgentLockArgs,
	deps: IAgentLockDeps = {},
): Promise<IAgentLockResponse> {
	const v = validateArgs(args);
	const lockPath = getLockPath(deps);
	const toolName = getToolName(deps);
	const lockFileLabel = getLockFileLabel(deps);
	if (!v.ok) {
		return {
			content: [
				{
					type: 'text',
					text: JSON.stringify({
						tool: toolName,
						action: args.action,
						path: lockFileLabel,
						error: v.error,
						blockerType: 'invalid-input',
						nextAction:
							'Correct the missing lock arguments once; if the intended files are unclear, inspect the proposal ownership before retrying.',
						summary: `invalid-input: ${v.error}`,
					}),
				},
			],
			isError: true,
		};
	}

	// Cross-process critical section: the whole read → mutate → write runs
	// under a file mutex so two concurrent agents can't lose each other's
	// updates (atomic writes alone prevent torn files, not lost updates).
	try {
		return await withFileMutex(
			lockPath,
			() => executeLockAction(args, deps),
			{
				onContention: args.onContention,
				...(deps.mutexTimeoutMs !== undefined
					? { timeoutMs: deps.mutexTimeoutMs }
					: {}),
				...(deps.mutexStaleMs !== undefined
					? { staleMs: deps.mutexStaleMs }
					: {}),
				...(deps.mutexPollMs !== undefined
					? { pollMs: deps.mutexPollMs }
					: {}),
			},
		);
	} catch (error) {
		if (error instanceof LockContentionError) {
			// M28: under `onContention:'fail'` a live holder past the timeout
			// rejects instead of being stolen — surface it as a clear tool
			// error (not an uncaught exception) so the caller can back off.
			return toolError(
				error.message,
				'Wait for the lock-released notification (or retry agent_lock status) instead of forcing a steal.',
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
	const lock = removeStale(await readLock(deps));

	if (args.action === 'claim') {
		const taskId = args.task_id as string;
		const agent = args.agent as string;
		const files = args.files as string[];

		const existing = lock.in_flight.find((e) => e.task_id === taskId);
		if (existing) {
			existing.last_seen = getNow(deps);
			await writeLock(lock, deps);
			return {
				content: [
					{
						type: 'text',
						text: JSON.stringify({
							tool: toolName,
							action: 'claim',
							task_id: taskId,
							refreshed: true,
							path: lockFileLabel,
							lock_path: lockPath,
							ownership_count: existing.ownership.length,
							summary: `refreshed ${taskId}`,
						}),
					},
				],
			};
		}

		for (const e of lock.in_flight) {
			const overlap = findOverlap(files, e.ownership);
			if (overlap.length > 0) {
				return {
					content: [
						{
							type: 'text',
							text: JSON.stringify({
								tool: toolName,
								action: 'claim',
								task_id: taskId,
								blocked: true,
								blockerType: 'lock-conflict',
								blocked_reason: `overlaps with ${e.task_id}`,
								conflicting_task: e.task_id,
								conflicting_agent: e.agent,
								overlapping_files: overlap,
								path: lockFileLabel,
								lock_path: lockPath,
								nextAction:
									'Do not retry the same claim. Route another owned slice whose files do not overlap, enqueue/observe this slice, or ask the orchestrator to reclaim stale ownership after evidence.',
								summary: `lock-conflict: ${taskId} overlaps ${e.task_id}`,
							}),
						},
					],
				};
			}
		}

		lock.in_flight.push({
			task_id: taskId,
			agent,
			ownership: files,
			started_at: getNow(deps),
			last_seen: getNow(deps),
			...(args.parent_task_id !== undefined
				? { parent_task_id: args.parent_task_id }
				: {}),
		});
		await writeLock(lock, deps);
		return {
			content: [
				{
					type: 'text',
					text: JSON.stringify({
						tool: toolName,
						action: 'claim',
						task_id: taskId,
						agent,
						path: lockFileLabel,
						lock_path: lockPath,
						ownership_count: files.length,
						claimed: true,
						summary: `claimed ${taskId} (${files.length} files)`,
					}),
				},
			],
		};
	}

	if (args.action === 'release') {
		const taskId = args.task_id as string;
		const before = lock.in_flight.length;
		lock.in_flight = lock.in_flight.filter((e) => e.task_id !== taskId);
		const dropped = before - lock.in_flight.length;
		await writeLock(lock, deps);
		return {
			content: [
				{
					type: 'text',
					text: JSON.stringify({
						tool: toolName,
						action: 'release',
						task_id: taskId,
						path: lockFileLabel,
						lock_path: lockPath,
						removed: dropped,
						summary:
							dropped > 0
								? `released ${taskId}`
								: `no active claim for ${taskId}`,
					}),
				},
			],
		};
	}

	if (args.action === 'status') {
		return {
			content: [
				{
					type: 'text',
					text: JSON.stringify({
						tool: toolName,
						action: 'status',
						path: lockFileLabel,
						lock_path: lockPath,
						exists: await fileExists(lockPath),
						active_write_lanes: lock.in_flight.length,
						summary: `${lock.in_flight.length} active write lane(s)`,
						...lock,
					}),
				},
			],
		};
	}

	if (args.action === 'gc') {
		const before = lock.in_flight.length;
		lock.in_flight = lock.in_flight.filter(
			(e) => !isStale(e, lock.stale_after_minutes),
		);
		const dropped = before - lock.in_flight.length;
		await writeLock(lock, deps);
		return {
			content: [
				{
					type: 'text',
					text: JSON.stringify({
						tool: toolName,
						action: 'gc',
						path: lockFileLabel,
						lock_path: lockPath,
						dropped,
						summary: `gc dropped ${dropped} stale claim(s)`,
					}),
				},
			],
		};
	}

	return {
		content: [
			{
				type: 'text',
				text: JSON.stringify({ error: 'unreachable' }),
			},
		],
		isError: true,
	};
}

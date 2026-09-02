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
} from '@mcp-vertex/core/public';

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

export type IAgentLockAction =
	| 'claim'
	| 'heartbeat'
	| 'release'
	| 'status'
	| 'gc';

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
	// x00155 S2 / x00153 S5 — cross-process release tracking. Both
	// fields are optional so locks persisted before the tracking was
	// added (e.g. a host process that has not yet been restarted)
	// still parse; the release handler treats missing fields as
	// "backfill on next touch" rather than as a hard mismatch.
	host?: string;
	pid?: number;
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
	/**
	 * x00155 S2 / x00153 S5 — caller-host identity used to detect a
	 * cross-process release after a host restart. Defaults to
	 * `{ host: os.hostname(), pid: process.pid }`. Tests inject a
	 * deterministic value to simulate the "new PID's
	 * `vscode-copilot-m3` agent" scenario.
	 */
	nowHostId?: () => { host: string; pid: number };
};

export type IAgentLockResponse = {
	content: Array<{ type: 'text'; text: string }>;
	isError?: boolean;
};

// x00155 S2 / x00153 S5 — one JSONL line per cross-process release.
// Lives under `.cache/mcp-vertex/agents.lock.releases.jsonl`; operators
// grep this to find host-restart patterns in production.
export type IReleaseAuditEntry = {
	readonly task_id: string;
	readonly agent: string;
	readonly originalHost: string | undefined;
	readonly originalPid: number | undefined;
	readonly releasingHost: string;
	readonly releasingPid: number;
	readonly ts: string;
	readonly reason: 'cross-process release';
};

const resolveCallerHostId = (
	deps: IAgentLockDeps,
): { host: string; pid: number } => {
	if (deps.nowHostId !== undefined) {
		return deps.nowHostId();
	}
	return { host: hostname(), pid: process.pid };
};

const isMissingFileErrno = (err: unknown): boolean => {
	if (typeof err !== 'object' || err === null) return false;
	const code = (err as { code?: unknown }).code;
	return code === 'ENOENT';
};

const appendReleaseAuditEntry = async (
	entry: IReleaseAuditEntry,
	workspaceRoot: string | undefined,
): Promise<void> => {
	if (workspaceRoot === undefined) return;
	const auditPath = join(workspaceRoot, RELEASE_AUDIT_LOG_RELATIVE_PATH);
	await withFileMutex(auditPath, async () => {
		await mkdir(dirname(auditPath), { recursive: true });
		try {
			const prefix = (
				await new SafeWorkspaceReader(dirname(auditPath)).readText(
					basename(auditPath),
				)
			).content;
			await writeFileAtomic(
				auditPath,
				`${prefix}${JSON.stringify(entry)}\n`,
			);
		} catch (err) {
			if (isMissingFileErrno(err)) {
				await writeFileAtomic(auditPath, `${JSON.stringify(entry)}\n`);
				return;
			}
			throw err;
		}
	});
};

let lastSessionWorkspaceRoot: string | undefined;
// f00154 S2 audit: the previous module-level single `lastKnownSessionBalance`
// bled across workspaces when the same MCP server reused its process to
// drive two workspaces sequentially (CI / orchestrator scenarios). After
// workspace A's `agent_lock release`, the cached balance held A's numbers
// and a subsequent read on workspace B reported A's session counters.
// Key the cache by absolute workspace root so each workspace has its
// own balance snapshot.
const EMPTY_BALANCE: ISessionBalance = {
	claims: 0,
	releases: 0,
	imbalance: 0,
};
const balanceByWorkspace = new Map<string, ISessionBalance>();

const knownBalanceFor = (
	workspaceRoot: string | undefined,
): ISessionBalance => {
	if (workspaceRoot === undefined) return EMPTY_BALANCE;
	return balanceByWorkspace.get(workspaceRoot) ?? EMPTY_BALANCE;
};

export const getAgentLockSessionBalance = async (
	workspaceRootAbs?: string,
): Promise<{
	readonly claims: number;
	readonly releases: number;
	readonly imbalance: number;
}> => {
	// Prefer the explicit workspace root; fall back to the last-seen
	// one (set by `runAgentLockEngine`); throw if neither is known.
	const workspaceRoot = workspaceRootAbs ?? lastSessionWorkspaceRoot;
	if (typeof workspaceRoot !== 'string' || workspaceRoot.length === 0) {
		throw new Error(
			'agent-lock: getAgentLockSessionBalance requires a workspaceRootAbs (or a prior runAgentLockEngine call to seed it). ' +
				'Refusing to read from process.cwd() — see AGENTS.md.',
		);
	}
	const fresh = await readSessionBalance(workspaceRoot);
	balanceByWorkspace.set(workspaceRoot, fresh);
	return fresh;
};

export const resetAgentLockSessionBalance = async (): Promise<void> => {
	balanceByWorkspace.clear();
	await resetSessionBalance();
};

/**
 * x00163 fix: this used to check only ONE level up (`basename(parent)
 * === '.cache'`), which is correct for a lock path shaped
 * `<root>/.cache/agents.lock.json` but wrong for the real, canonical
 * shape `<root>/.cache/mcp-vertex/agents.lock.json` (the plugin cache
 * dir adds an extra `mcp-vertex` segment). On the real shape the old
 * code returned `<root>/.cache/mcp-vertex` itself as the "workspace
 * root", which `sessionLogPath` then re-joined with `.cache/mcp-vertex`
 * again — producing a doubly-nested
 * `<root>/.cache/mcp-vertex/.cache/mcp-vertex/agents.lock.session.jsonl`
 * on every real session (confirmed live: this exact stray path exists
 * on disk in this repo's own `.cache/`). Walk up from the lock path
 * looking for a directory literally named `.cache` and return ITS
 * parent — this is correct for both the one-level test-fixture shape
 * and the real two-level plugin-cache-dir shape.
 */
const resolveSessionWorkspaceRoot = (
	deps: IAgentLockDeps,
): string | undefined => {
	if (!deps.lockPath) return undefined;
	let dir = dirname(deps.lockPath);
	for (;;) {
		if (basename(dir) === '.cache') return dirname(dir);
		const parent = dirname(dir);
		if (parent === dir) break;
		dir = parent;
	}
	return dirname(deps.lockPath);
};

const CONTENTION_NEXT =
	'Do not busy-poll agent_lock status. Call notification_await_lock (or wait for a lock-released notification via notify_status), then retry the claim once ownership is free.';

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
const livelockThresholdMs = (deps: IAgentLockDeps): number => {
	const staleMs = deps.mutexStaleMs ?? 30_000;
	const heartbeatMs = Math.max(50, Math.floor(staleMs / 3));
	return 2 * heartbeatMs;
};
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
		workspaceRoot?: string;
	} = {},
): IAgentLockResponse => {
	const blocked = payload.blocked === true;
	const isError = opts.isError === true;
	const ok = !isError && !blocked;
	// Resolve the balance for the CURRENT workspace rather than the
	// module-level singleton — the singleton used to bleed across
	// workspaces when the same MCP server drove two workspaces
	// sequentially (see `balanceByWorkspace` declaration above).
	const balance =
		opts.balance ??
		knownBalanceFor(opts.workspaceRoot ?? lastSessionWorkspaceRoot);
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
	// f00154 S2 audit: this function must NEVER throw — the underlying
	// lock op has already succeeded by the time we get here, and a
	// failure in the session-log write (disk full, EACCES on the
	// .cache dir, …) used to bubble up and made the caller see the
	// claim/release as failed when it actually succeeded. The lock
	// outcome is encoded in `response`; treat telemetry as best-effort.
	const workspaceRoot = resolveSessionWorkspaceRoot(deps);
	if (typeof workspaceRoot !== 'string' || workspaceRoot.length === 0) {
		// f00154 S2 audit: refuse to fall back to cwd() — without an
		// explicit workspace root we cannot write the session log to the
		// correct location. Skip telemetry and return the response
		// untouched (the lock op already succeeded).
		return response;
	}
	const raw = response.content[0]?.text;
	if (typeof raw !== 'string') return response;
	let payload: Record<string, unknown>;
	try {
		payload = JSON.parse(raw) as Record<string, unknown>;
	} catch {
		return response;
	}
	try {
		if (
			args.action === 'claim' &&
			payload.claimed === true &&
			payload.ok === true
		) {
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
		const fresh = await readSessionBalance(workspaceRoot);
		balanceByWorkspace.set(workspaceRoot, fresh);
	} catch (telemetryError) {
		// Telemetry failure: log on stderr and continue. The lock op's
		// outcome lives in `response` and must not be invalidated by
		// a session-log write.
		process.stderr.write(
			`agent_lock: session log update failed (${(telemetryError as Error).message}); lock op result preserved.\n`,
		);
		return response;
	}
	return replaceSessionBalance(response, knownBalanceFor(workspaceRoot));
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

const writeLock = async (
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

const readSynchronizedLock = async (
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
	if (args.action === 'heartbeat' && (!args.task_id || !args.agent)) {
		return {
			ok: false,
			error: 'heartbeat requires task_id and agent',
		};
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
		// `.cache/mcp-vertex/agents.lock.releases.jsonl`.
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

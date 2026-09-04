import { basename, dirname, join } from 'node:path';

import {
	SafeWorkspaceReader,
	writeFileAtomic,
	withFileMutex,
} from '@delendai/core/public';

import { DEFAULT_PATH_LAYOUT } from '../contracts/constants/default-path-layout.constant';
import {
	getContentionPath,
	pruneContentions,
	readContentions,
	writeContentions,
} from './file-lock-contentions';
import {
	coerceTable,
	emptyDocument,
	emptyTable,
	entriesToTable,
	normalizeEntries,
	normalizeFiles,
	readDocument,
	writeDocument,
} from './file-lock-document';
import { CONTENTION_HISTORY_WINDOW_MS } from '../contracts/constants/agent-lock-engine.constant';

/**
 * x00154 S5 — typed error thrown (and surfaced to the operator) when
 * the contention file at `path` contains invalid JSON. Callers can
 * distinguish a corrupt contention file (`LocksFileCorruptError`)
 * from a missing one (`ENOENT`) or a downstream write failure.
 */
export class LocksFileCorruptError extends Error {
	readonly path: string;
	override readonly cause: SyntaxError;
	constructor(path: string, cause: SyntaxError) {
		super(`Locks contention file is corrupt: ${path}`);
		this.name = 'LocksFileCorruptError';
		this.path = path;
		this.cause = cause;
	}
}

/**
 * x00154 S5 — minimum event shape the proposals lock table emits
 * when it has to recover from corruption. Mirrors `ILogEvent` from
 * `@delendai/logs` without importing it (the proposals plugin
 * does not depend on the logs plugin). Host code that wants to
 * forward the event into the structured event log can normalise
 * the payload into the canonical `ILogEvent` shape before calling
 * `appendEvent`.
 */
export interface IFileLockTableLogEvent {
	readonly kind: 'log-warning';
	readonly summary: string;
	readonly file: string;
	readonly meta?: Readonly<Record<string, unknown>>;
}

export interface IFileLock {
	readonly file: string;
	readonly agent: string;
	readonly taskId: string;
	readonly mtimeIso: string;
}
export interface IFileLockContention {
	readonly kind: 'disjoint' | 'overlap';
	readonly waitingTaskId: string;
	readonly waitingAgentId: string;
	readonly holderTaskId?: string;
	readonly holderAgentId: string;
	readonly files: readonly string[];
	readonly startedAt: string;
	readonly lastSeenAt: string;
	readonly resolvedAt?: string;
}

export type FileLockTable = Record<
	string,
	{ agentId: string; mtime: string; taskId?: string }
>;

export interface IFileLockTableDeps {
	readonly tablePath?: string;
	readonly now?: () => string;
	readonly readTable?: (path: string) => Promise<string>;
	readonly writeTableAtomic?: (path: string, body: string) => Promise<void>;
	readonly mutexTimeoutMs?: number;
	readonly mutexStaleMs?: number;
	readonly mutexPollMs?: number;
	/**
	 * x00154 S5 — host-supplied writer for structured log events
	 * (currently only `log-warning`, emitted when the contention file
	 * is corrupt). Defaults to a no-op when not provided so existing
	 * callers keep their behaviour.
	 */
	readonly emitLog?: (event: IFileLockTableLogEvent) => Promise<void>;
}

export const defaultReadTable = async (path: string): Promise<string> =>
	(await new SafeWorkspaceReader(dirname(path)).readText(basename(path)))
		.content;

export const defaultWriteTable = async (
	path: string,
	body: string,
): Promise<void> => writeFileAtomic(path, body);

export const getNow = (deps: Pick<IFileLockTableDeps, 'now'> = {}): string =>
	(deps.now ?? (() => new Date().toISOString()))();

export const deriveFileLockTablePath = (
	lockPath?: string,
	tablePath?: string,
): string => {
	if (tablePath !== undefined) return tablePath;
	if (lockPath !== undefined)
		return join(dirname(lockPath), 'file-locks.json');
	return join(dirname(DEFAULT_PATH_LAYOUT.lockFile), 'file-locks.json');
};

export const getTablePath = (
	deps: { readonly tablePath?: string } = {},
): string => deriveFileLockTablePath(undefined, deps.tablePath);

const getMutexOpts = (deps: {
	readonly mutexTimeoutMs?: number;
	readonly mutexStaleMs?: number;
	readonly mutexPollMs?: number;
}) => ({
	...(deps.mutexTimeoutMs !== undefined
		? { timeoutMs: deps.mutexTimeoutMs }
		: {}),
	...(deps.mutexStaleMs !== undefined ? { staleMs: deps.mutexStaleMs } : {}),
	...(deps.mutexPollMs !== undefined ? { pollMs: deps.mutexPollMs } : {}),
});

const withMutex = async <T>(
	_path: string,
	opts: Parameters<typeof getMutexOpts>[0],
	fn: () => Promise<T>,
): Promise<T> => {
	const mutexOpts = getMutexOpts(opts);
	return withFileMutex(_path, fn, mutexOpts);
};

export const isMissingFileErrno = (err: unknown): boolean => {
	if (typeof err !== 'object' || err === null) return false;
	const code = (err as { code?: unknown }).code;
	return code === 'ENOENT' || code === 'ENOTDIR';
};

export const readFileLockEntries = async (
	deps: Pick<IFileLockTableDeps, 'tablePath' | 'readTable'> = {},
): Promise<readonly IFileLock[]> => {
	const doc = await readDocument(deps);
	return Object.entries(doc.locks).map(([file, entry]) => ({
		file,
		agent: entry.agentId,
		taskId: entry.taskId ?? '',
		mtimeIso: entry.mtime,
	}));
};

export const readFileLockTable = async (
	deps: Pick<IFileLockTableDeps, 'tablePath' | 'readTable'> = {},
): Promise<FileLockTable> => {
	const doc = await readDocument(deps);
	return doc.locks;
};

export async function addFileLocks(
	locks: readonly IFileLock[],
	deps: IFileLockTableDeps,
): Promise<void>;
export async function addFileLocks(opts: {
	readonly agentId: string;
	readonly files: readonly string[];
	readonly taskId?: string;
	readonly tablePath?: string;
	readonly now?: () => string;
	readonly mutexTimeoutMs?: number;
	readonly mutexStaleMs?: number;
	readonly mutexPollMs?: number;
}): Promise<void>;
export async function addFileLocks(
	first:
		| readonly IFileLock[]
		| {
				readonly agentId: string;
				readonly files: readonly string[];
				readonly taskId?: string;
				readonly tablePath?: string;
				readonly now?: () => string;
				readonly mutexTimeoutMs?: number;
				readonly mutexStaleMs?: number;
				readonly mutexPollMs?: number;
		  },
	second: IFileLockTableDeps = {},
): Promise<void> {
	let deps: IFileLockTableDeps;
	let entries: readonly IFileLock[];
	if (Array.isArray(first)) {
		deps = second;
		entries = first;
	} else {
		const options = first as {
			readonly agentId: string;
			readonly files: readonly string[];
			readonly taskId?: string;
			readonly tablePath?: string;
			readonly now?: () => string;
			readonly mutexTimeoutMs?: number;
			readonly mutexStaleMs?: number;
			readonly mutexPollMs?: number;
		};
		deps = options;
		entries = normalizeFiles(options.files).map((file) => ({
			file,
			agent: options.agentId,
			taskId: options.taskId ?? '',
			mtimeIso: getNow(options),
		}));
	}
	if (entries.length === 0) return;
	await withMutex(getTablePath(deps), deps, async () => {
		const current = await readDocument({
			...(deps.tablePath !== undefined
				? { tablePath: deps.tablePath }
				: {}),
		});
		const next: FileLockTable = { ...current.locks };
		for (const entry of entries) {
			next[entry.file] = {
				agentId: entry.agent,
				mtime: entry.mtimeIso,
				...(entry.taskId.length > 0 ? { taskId: entry.taskId } : {}),
			};
		}
		await writeDocument(
			{
				version: 2,
				locks: next,
				contentionHistory: current.contentionHistory,
			},
			{
				...(deps.tablePath !== undefined
					? { tablePath: deps.tablePath }
					: {}),
			},
		);
	});
}

export async function removeFileLocksForTask(
	taskId: string,
	deps?: Pick<
		IFileLockTableDeps,
		'tablePath' | 'mutexTimeoutMs' | 'mutexStaleMs' | 'mutexPollMs'
	>,
): Promise<void>;
export async function removeFileLocksForTask(opts: {
	readonly taskId: string;
	readonly tablePath?: string;
	readonly mutexTimeoutMs?: number;
	readonly mutexStaleMs?: number;
	readonly mutexPollMs?: number;
}): Promise<void>;
export async function removeFileLocksForTask(
	first:
		| string
		| {
				readonly taskId: string;
				readonly tablePath?: string;
				readonly mutexTimeoutMs?: number;
				readonly mutexStaleMs?: number;
				readonly mutexPollMs?: number;
		  },
	second: Pick<
		IFileLockTableDeps,
		'tablePath' | 'mutexTimeoutMs' | 'mutexStaleMs' | 'mutexPollMs'
	> = {},
): Promise<void> {
	const opts =
		typeof first === 'string' ? { taskId: first, ...second } : first;
	await withMutex(getTablePath(opts), opts, async () => {
		const current = await readDocument({
			...(opts.tablePath !== undefined
				? { tablePath: opts.tablePath }
				: {}),
		});
		const next: FileLockTable = {};
		for (const [file, entry] of Object.entries(current.locks)) {
			if (entry.taskId !== opts.taskId) {
				next[file] = entry;
			}
		}
		await writeDocument(
			{
				version: 2,
				locks: next,
				contentionHistory: current.contentionHistory,
			},
			{
				...(opts.tablePath !== undefined
					? { tablePath: opts.tablePath }
					: {}),
			},
		);
	});
}

export function findConflictingLocks(
	files: readonly string[],
	entries: readonly IFileLock[],
): readonly IFileLock[];
export function findConflictingLocks(
	currentTaskId: string,
	files: readonly string[],
	deps?: Pick<IFileLockTableDeps, 'tablePath' | 'readTable'>,
): Promise<readonly IFileLock[]>;
export function findConflictingLocks(
	first: string | readonly string[],
	second: readonly string[] | readonly IFileLock[],
	third: Pick<IFileLockTableDeps, 'tablePath' | 'readTable'> = {},
): Promise<readonly IFileLock[]> | readonly IFileLock[] {
	if (
		Array.isArray(first) &&
		Array.isArray(second) &&
		typeof second[0] !== 'string'
	) {
		const wanted = new Set(first);
		return second.filter((entry) => wanted.has(entry.file));
	}
	const currentTaskId = first as string;
	const files = second as readonly string[];
	return (async () => {
		const doc = await readDocument(third);
		const conflicts: IFileLock[] = [];
		for (const file of files) {
			const entry = doc.locks[file];
			if (entry && entry.taskId !== currentTaskId) {
				conflicts.push({
					file,
					agent: entry.agentId,
					taskId: entry.taskId ?? '',
					mtimeIso: entry.mtime,
				});
			}
		}
		return conflicts;
	})();
}

export const tryAcquireFileLocks = async (opts: {
	readonly agentId: string;
	readonly taskId?: string;
	readonly files: readonly string[];
	readonly tablePath?: string;
	readonly now?: () => string;
	readonly mutexTimeoutMs?: number;
	readonly mutexStaleMs?: number;
	readonly mutexPollMs?: number;
}): Promise<
	| { ok: true }
	| { ok: false; conflictOn: string; heldBy: string; heldTaskId?: string }
> => {
	const files = normalizeFiles(opts.files);
	if (files.length === 0) return { ok: true };
	const conflicts = await findConflictingLocks(opts.taskId ?? '', files, {
		...(opts.tablePath !== undefined ? { tablePath: opts.tablePath } : {}),
	});
	if (conflicts.length > 0) {
		return {
			ok: false,
			conflictOn: conflicts[0]!.file,
			heldBy: conflicts[0]!.agent,
			...(conflicts[0]!.taskId.length > 0
				? { heldTaskId: conflicts[0]!.taskId }
				: {}),
		};
	}
	await withMutex(getTablePath(opts), opts, async () => {
		const current = await readDocument({
			...(opts.tablePath !== undefined
				? { tablePath: opts.tablePath }
				: {}),
		});
		const next: FileLockTable = { ...current.locks };
		for (const file of files) {
			next[file] = {
				agentId: opts.agentId,
				mtime: getNow(opts),
				...(opts.taskId !== undefined ? { taskId: opts.taskId } : {}),
			};
		}
		await writeDocument(
			{
				version: 2,
				locks: next,
				contentionHistory: current.contentionHistory,
			},
			{
				...(opts.tablePath !== undefined
					? { tablePath: opts.tablePath }
					: {}),
			},
		);
	});
	return { ok: true };
};

export const releaseFileLocks = async (opts: {
	readonly agentId: string;
	readonly files: readonly string[];
	readonly tablePath?: string;
	readonly mutexTimeoutMs?: number;
	readonly mutexStaleMs?: number;
	readonly mutexPollMs?: number;
}): Promise<void> => {
	const files = [...new Set(opts.files)].sort();
	if (files.length === 0) return;
	await withMutex(getTablePath(opts), opts, async () => {
		const current = await readDocument({
			...(opts.tablePath !== undefined
				? { tablePath: opts.tablePath }
				: {}),
		});
		const next: FileLockTable = { ...current.locks };
		let changed = false;
		for (const file of files) {
			if (next[file]?.agentId !== opts.agentId) continue;
			delete next[file];
			changed = true;
		}
		if (!changed) return;
		await writeDocument(
			{
				version: 2,
				locks: next,
				contentionHistory: current.contentionHistory,
			},
			{
				...(opts.tablePath !== undefined
					? { tablePath: opts.tablePath }
					: {}),
			},
		);
	});
};

export const listLocks = async (
	deps: Pick<IFileLockTableDeps, 'tablePath' | 'readTable'> = {},
): Promise<FileLockTable> => {
	const doc = await readDocument(deps);
	return doc.locks;
};

export const noteFileLockContention = async (opts: {
	readonly kind: 'disjoint' | 'overlap';
	readonly waitingTaskId: string;
	readonly waitingAgentId: string;
	readonly holderTaskId?: string;
	readonly holderAgentId: string;
	readonly files: readonly string[];
	readonly tablePath?: string;
	readonly now?: () => string;
	readonly mutexTimeoutMs?: number;
	readonly mutexStaleMs?: number;
	readonly mutexPollMs?: number;
}): Promise<IFileLockContention & { heldMs: number }> => {
	const now = getNow(opts);
	const files = [...opts.files].sort();
	return withMutex(getContentionPath(opts), opts, async () => {
		const current = [...(await readContentions(opts))];
		const foundIndex = current.findIndex(
			(entry) =>
				entry.resolvedAt === undefined &&
				entry.kind === opts.kind &&
				entry.waitingTaskId === opts.waitingTaskId &&
				entry.holderAgentId === opts.holderAgentId &&
				(entry.holderTaskId ?? '') === (opts.holderTaskId ?? '') &&
				entry.files.join(',') === files.join(','),
		);
		const next: IFileLockContention =
			foundIndex === -1
				? {
						kind: opts.kind,
						waitingTaskId: opts.waitingTaskId,
						waitingAgentId: opts.waitingAgentId,
						holderAgentId: opts.holderAgentId,
						...(opts.holderTaskId !== undefined
							? { holderTaskId: opts.holderTaskId }
							: {}),
						files,
						startedAt: now,
						lastSeenAt: now,
					}
				: { ...current[foundIndex]!, lastSeenAt: now };
		if (foundIndex === -1) current.push(next);
		else current.splice(foundIndex, 1, next);
		await writeContentions(current, { tablePath: getTablePath(opts) });
		return {
			...next,
			heldMs:
				new Date(now).getTime() - new Date(next.startedAt).getTime(),
		};
	});
};

export const resolveFileLockContentions = async (opts: {
	readonly waitingTaskId?: string;
	readonly holderTaskId?: string;
	readonly holderAgentId?: string;
	readonly files?: readonly string[];
	readonly tablePath?: string;
	readonly now?: () => string;
	readonly mutexTimeoutMs?: number;
	readonly mutexStaleMs?: number;
	readonly mutexPollMs?: number;
}): Promise<void> => {
	const now = getNow(opts);
	await withMutex(getContentionPath(opts), opts, async () => {
		const next = (await readContentions(opts)).map((entry) => {
			if (entry.resolvedAt !== undefined) return entry;
			if (
				opts.waitingTaskId !== undefined &&
				entry.waitingTaskId !== opts.waitingTaskId
			)
				return entry;
			if (
				opts.holderTaskId !== undefined &&
				entry.holderTaskId !== opts.holderTaskId
			)
				return entry;
			if (
				opts.holderAgentId !== undefined &&
				entry.holderAgentId !== opts.holderAgentId
			)
				return entry;
			if (
				opts.files !== undefined &&
				![...opts.files].every((file) => entry.files.includes(file))
			)
				return entry;
			return { ...entry, resolvedAt: now, lastSeenAt: now };
		});
		await writeContentions(next, { tablePath: getTablePath(opts) });
	});
};

export const listRecentFileLockContentions = async (
	deps: IFileLockTableDeps = {},
): Promise<readonly IFileLockContention[]> => readContentions(deps);

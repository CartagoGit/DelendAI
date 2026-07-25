import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';

import { writeFileAtomic, withFileMutex } from '@mcp-vertex/core/public';

import { DEFAULT_PATH_LAYOUT } from '../contracts/constants/default-path-layout.constant';

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
}

const CONTENTION_HISTORY_WINDOW_MS = 60_000;

const EMPTY_TABLE = (): FileLockTable => ({});

const EMPTY_DOCUMENT = (): {
	readonly version: 2;
	readonly locks: FileLockTable;
	readonly contentionHistory: readonly IFileLockContention[];
} => ({
	version: 2,
	locks: EMPTY_TABLE(),
	contentionHistory: [],
});

const defaultReadTable = async (path: string): Promise<string> =>
	readFile(path, 'utf8');

const defaultWriteTable = async (path: string, body: string): Promise<void> =>
	writeFileAtomic(path, body);

const getNow = (deps: Pick<IFileLockTableDeps, 'now'> = {}): string =>
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

const getTablePath = (deps: { readonly tablePath?: string } = {}): string =>
	deriveFileLockTablePath(undefined, deps.tablePath);

const getContentionPath = (
	deps: { readonly tablePath?: string } = {},
): string => {
	const base = getTablePath(deps);
	return join(dirname(base), 'file-lock-contentions.json');
};

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
	if (mutexOpts.timeoutMs !== undefined) {
		return withFileMutex({ filePath: _path, ...mutexOpts }, fn);
	}
	return withFileMutex({ filePath: _path }, fn);
};

const normalizeFiles = (files: readonly string[]): string[] =>
	[...new Set(files)].sort();

const sameFiles = (
	left: readonly string[],
	right: readonly string[],
): boolean => {
	if (left.length !== right.length) return false;
	for (let index = 0; index < left.length; index += 1) {
		if (left[index] !== right[index]) return false;
	}
	return true;
};

const normalizeEntries = (entries: readonly IFileLock[]): IFileLock[] =>
	[...entries].sort(
		(a, b) =>
			a.file.localeCompare(b.file) ||
			a.taskId.localeCompare(b.taskId) ||
			a.agent.localeCompare(b.agent),
	);

const readDocument = async (
	deps: Pick<IFileLockTableDeps, 'tablePath' | 'readTable'>,
): Promise<ReturnType<typeof EMPTY_DOCUMENT>> => {
	try {
		const raw = await (deps.readTable ?? defaultReadTable)(
			getTablePath(deps),
		);
		const parsed = JSON.parse(raw) as unknown;
		if (
			typeof parsed === 'object' &&
			parsed !== null &&
			'version' in parsed &&
			'locks' in parsed
		) {
			const doc = parsed as {
				version: number;
				locks: FileLockTable;
				contentionHistory?: readonly IFileLockContention[];
			};
			if (doc.version === 2) {
				return {
					version: 2,
					locks: doc.locks ?? EMPTY_TABLE(),
					contentionHistory: doc.contentionHistory ?? [],
				};
			}
		}
		return EMPTY_DOCUMENT();
	} catch {
		return EMPTY_DOCUMENT();
	}
};

const writeDocument = async (
	doc: ReturnType<typeof EMPTY_DOCUMENT>,
	deps: Pick<IFileLockTableDeps, 'tablePath' | 'writeTableAtomic'>,
): Promise<void> => {
	const writer = deps.writeTableAtomic ?? defaultWriteTable;
	await writer(getTablePath(deps), JSON.stringify(doc, null, 2));
};

const readContentions = async (
	deps: IFileLockTableDeps,
): Promise<readonly IFileLockContention[]> => {
	const current = await readDocument(deps);
	const nowMs = new Date(getNow(deps)).getTime();
	return pruneContentions(
		current.contentionHistory,
		Number.isNaN(nowMs) ? Date.now() : nowMs,
	);
};

const writeContentions = async (
	records: readonly IFileLockContention[],
	deps: Pick<IFileLockTableDeps, 'tablePath' | 'writeTableAtomic'>,
): Promise<void> => {
	const path = getContentionPath(deps);
	const writer = deps.writeTableAtomic ?? defaultWriteTable;
	await writer(path, JSON.stringify(records, null, 2));
};

const pruneContentions = (
	records: readonly IFileLockContention[],
	nowMs: number,
): readonly IFileLockContention[] =>
	records.filter((r) => {
		if (r.resolvedAt === undefined) return true;
		const resolvedMs = new Date(r.resolvedAt).getTime();
		if (Number.isNaN(resolvedMs)) return true;
		return nowMs - resolvedMs <= CONTENTION_HISTORY_WINDOW_MS;
	});

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

export const addFileLocks = async (opts: {
	readonly agentId: string;
	readonly files: readonly string[];
	readonly taskId?: string;
	readonly tablePath?: string;
	readonly now?: () => string;
	readonly mutexTimeoutMs?: number;
	readonly mutexStaleMs?: number;
	readonly mutexPollMs?: number;
}): Promise<void> => {
	const now = getNow(opts);
	const files = normalizeFiles(opts.files);
	if (files.length === 0) return;
	await withMutex(getTablePath(opts), opts, async () => {
		const current = await readDocument({ tablePath: opts.tablePath });
		const next: FileLockTable = { ...current.locks };
		for (const file of files) {
			next[file] = {
				agentId: opts.agentId,
				mtime: now,
				...(opts.taskId !== undefined ? { taskId: opts.taskId } : {}),
			};
		}
		await writeDocument(
			{
				version: 2,
				locks: next,
				contentionHistory: current.contentionHistory,
			},
			{ tablePath: opts.tablePath },
		);
	});
};

export const removeFileLocksForTask = async (opts: {
	readonly taskId: string;
	readonly tablePath?: string;
	readonly mutexTimeoutMs?: number;
	readonly mutexStaleMs?: number;
	readonly mutexPollMs?: number;
}): Promise<void> => {
	await withMutex(getTablePath(opts), opts, async () => {
		const current = await readDocument({ tablePath: opts.tablePath });
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
			{ tablePath: opts.tablePath },
		);
	});
};

export const findConflictingLocks = (
	currentTaskId: string,
	files: readonly string[],
	deps: Pick<IFileLockTableDeps, 'tablePath' | 'readTable'> = {},
): Promise<readonly IFileLock[]> => {
	return (async () => {
		const doc = await readDocument(deps);
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
};

export const tryAcquireFileLocks = async (opts: {
	readonly agentId: string;
	readonly taskId: string;
	readonly files: readonly string[];
	readonly tablePath?: string;
	readonly now?: () => string;
	readonly mutexTimeoutMs?: number;
	readonly mutexStaleMs?: number;
	readonly mutexPollMs?: number;
}): Promise<
	| { ok: true; acquired: readonly string[] }
	| { ok: false; conflictOn: readonly string[]; heldBy: readonly IFileLock[] }
> => {
	const files = normalizeFiles(opts.files);
	if (files.length === 0) return { ok: true, acquired: [] };
	const conflicts = await findConflictingLocks(opts.taskId, files, {
		tablePath: opts.tablePath,
	});
	if (conflicts.length > 0) {
		return {
			ok: false,
			conflictOn: conflicts.map((c) => c.file),
			heldBy: conflicts,
		};
	}
	await addFileLocks({
		agentId: opts.agentId,
		files,
		taskId: opts.taskId,
		...(opts.tablePath !== undefined ? { tablePath: opts.tablePath } : {}),
		...(opts.now !== undefined ? { now: opts.now } : {}),
		...(opts.mutexTimeoutMs !== undefined
			? { mutexTimeoutMs: opts.mutexTimeoutMs }
			: {}),
		...(opts.mutexStaleMs !== undefined
			? { mutexStaleMs: opts.mutexStaleMs }
			: {}),
		...(opts.mutexPollMs !== undefined
			? { mutexPollMs: opts.mutexPollMs }
			: {}),
	});
	return { ok: true, acquired: files };
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
		const current = await readDocument({ tablePath: opts.tablePath });
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
			{ tablePath: opts.tablePath },
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

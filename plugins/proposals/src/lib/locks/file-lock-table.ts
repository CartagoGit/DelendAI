import { basename, dirname, join } from 'node:path';

import {
	SafeWorkspaceReader,
	writeFileAtomic,
	withFileMutex,
} from '@mcp-vertex/core/public';

import { DEFAULT_PATH_LAYOUT } from '../contracts/constants/default-path-layout.constant';

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
 * `@mcp-vertex/logs` without importing it (the proposals plugin
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
	(await new SafeWorkspaceReader(dirname(path)).readText(basename(path)))
		.content;

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
	return withFileMutex(_path, fn, mutexOpts);
};

const normalizeFiles = (files: readonly string[]): string[] =>
	[...new Set(files)].sort();

const _sameFiles = (
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

const entriesToTable = (entries: readonly IFileLock[]): FileLockTable => {
	const table: FileLockTable = {};
	for (const entry of normalizeEntries(entries)) {
		table[entry.file] = {
			agentId: entry.agent,
			mtime: entry.mtimeIso,
			...(entry.taskId.length > 0 ? { taskId: entry.taskId } : {}),
		};
	}
	return table;
};

const coerceTable = (parsed: unknown): FileLockTable => {
	if (Array.isArray(parsed)) {
		return entriesToTable(
			parsed.filter((value): value is IFileLock => {
				if (typeof value !== 'object' || value === null) return false;
				const candidate = value as Record<string, unknown>;
				return (
					typeof candidate.file === 'string' &&
					typeof candidate.agent === 'string' &&
					typeof candidate.taskId === 'string' &&
					typeof candidate.mtimeIso === 'string'
				);
			}),
		);
	}
	if (parsed === null || typeof parsed !== 'object') return EMPTY_TABLE();
	const table: FileLockTable = {};
	for (const [file, value] of Object.entries(parsed)) {
		if (typeof value !== 'object' || value === null) continue;
		const candidate = value as Record<string, unknown>;
		if (
			typeof candidate.agentId !== 'string' ||
			typeof candidate.mtime !== 'string'
		) {
			continue;
		}
		table[file] = {
			agentId: candidate.agentId,
			mtime: candidate.mtime,
			...(typeof candidate.taskId === 'string'
				? { taskId: candidate.taskId }
				: {}),
		};
	}
	return table;
};

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
		return {
			version: 2,
			locks: coerceTable(parsed),
			contentionHistory: [],
		};
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

/**
 * x00154 S5 — `ENOENT` (and `ENOTDIR`) are normal "the contention
 * file does not exist yet" outcomes; everything else is a real
 * read failure. We keep the discrimination local so the proposal
 * plugin does not need a shared `isEnoent` helper.
 */
const isMissingFileErrno = (err: unknown): boolean => {
	if (typeof err !== 'object' || err === null) return false;
	const code = (err as { code?: unknown }).code;
	return code === 'ENOENT' || code === 'ENOTDIR';
};

const readContentions = async (
	deps: IFileLockTableDeps,
): Promise<readonly IFileLockContention[]> => {
	const contentionPath = getContentionPath(deps);
	try {
		const raw = await (deps.readTable ?? defaultReadTable)(contentionPath);
		if (raw.length > 0) {
			const parsed = JSON.parse(raw) as unknown;
			if (Array.isArray(parsed)) {
				const nowMs = new Date(getNow(deps)).getTime();
				return pruneContentions(
					parsed as readonly IFileLockContention[],
					Number.isNaN(nowMs) ? Date.now() : nowMs,
				);
			}
		}
	} catch (err) {
		if (err instanceof SyntaxError) {
			// x00154 S5 — surface corrupt contention file as a structured
			// log-warning and fall back to the lock-table's
			// contentionHistory. We do NOT rethrow: callers (listers,
			// resolve-time sweepers) must continue to function when the
			// contention file is bad, mirroring today's behaviour.
			const wrapped = new LocksFileCorruptError(contentionPath, err);
			if (deps.emitLog) {
				await deps.emitLog({
					kind: 'log-warning',
					summary: `Locks contention file is corrupt: ${contentionPath}`,
					file: contentionPath,
					meta: { errorName: err.name, errorMessage: err.message },
				});
			}
			void wrapped; // surfaced via the typed export for callers/tests.
		} else if (!isMissingFileErrno(err)) {
			throw err;
		}
		// Missing file (ENOENT/ENOTDIR) → silent fallback, current
		// behaviour. Falls through to `readDocument` below.
	}
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
		const activityAt = r.resolvedAt ?? r.lastSeenAt;
		const activityMs = new Date(activityAt).getTime();
		if (Number.isNaN(activityMs)) return true;
		return nowMs - activityMs <= CONTENTION_HISTORY_WINDOW_MS;
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

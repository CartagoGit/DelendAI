/**
 * file-lock-document.ts — r00042 S3.
 *
 * Moved out of `file-lock-table.ts` verbatim to bring it under the
 * 600-line ceiling this proposal sets. Declarations relocated, never
 * rewritten.
 */
import type {
	FileLockTable,
	IFileLock,
	IFileLockContention,
	IFileLockTableDeps,
} from './file-lock-table';
import {
	defaultReadTable,
	defaultWriteTable,
	getTablePath,
} from './file-lock-table';

export const emptyTable = (): FileLockTable => ({});

export const emptyDocument = (): {
	readonly version: 2;
	readonly locks: FileLockTable;
	readonly contentionHistory: readonly IFileLockContention[];
} => ({
	version: 2,
	locks: emptyTable(),
	contentionHistory: [],
});

export const normalizeFiles = (files: readonly string[]): string[] =>
	[...new Set(files)].sort();

export const _sameFiles = (
	left: readonly string[],
	right: readonly string[],
): boolean => {
	if (left.length !== right.length) return false;
	for (let index = 0; index < left.length; index += 1) {
		if (left[index] !== right[index]) return false;
	}
	return true;
};

export const normalizeEntries = (entries: readonly IFileLock[]): IFileLock[] =>
	[...entries].sort(
		(a, b) =>
			a.file.localeCompare(b.file) ||
			a.taskId.localeCompare(b.taskId) ||
			a.agent.localeCompare(b.agent),
	);

export const entriesToTable = (
	entries: readonly IFileLock[],
): FileLockTable => {
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

export const coerceTable = (parsed: unknown): FileLockTable => {
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
	if (parsed === null || typeof parsed !== 'object') return emptyTable();
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

export const readDocument = async (
	deps: Pick<IFileLockTableDeps, 'tablePath' | 'readTable'>,
): Promise<ReturnType<typeof emptyDocument>> => {
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
					locks: doc.locks ?? emptyTable(),
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
		return emptyDocument();
	}
};

export const writeDocument = async (
	doc: ReturnType<typeof emptyDocument>,
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

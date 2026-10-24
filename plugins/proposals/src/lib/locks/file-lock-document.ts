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
import { quarantineCorruptFile } from '@delendai/core/public';

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

/**
 * The file-lock table could not be read as a table. A claim decided on
 * an empty table in its place granted files others held, and the next
 * write replaced the unreadable bytes with that empty table.
 */
export class FileLockTableUnreadableError extends Error {
	constructor(
		readonly tablePath: string,
		readonly reason: string,
		/** Where the unreadable bytes were kept, when they were moved aside. */
		readonly quarantinedAt?: string,
	) {
		super(
			`the file-lock table ${tablePath} is unreadable (${reason})${quarantinedAt === undefined ? '' : `; its bytes are kept at ${quarantinedAt}`}`,
		);
		this.name = 'FileLockTableUnreadableError';
	}
}

const READ_ATTEMPTS = 3;
const READ_RETRY_MS = 15;

const errorCode = (error: unknown): string | undefined =>
	typeof error === 'object' && error !== null && 'code' in error
		? String((error as { code: unknown }).code)
		: undefined;

const pause = (ms: number): Promise<void> =>
	new Promise((resolve) => setTimeout(resolve, ms));

/**
 * The table's text, or `null` when there is no table. Only a missing
 * file is "no table", and only when it is still missing a moment later:
 * a read that fails for any other reason is tried again, and one that
 * keeps failing is an error, never an empty table.
 */
const readTableText = async (
	deps: Pick<IFileLockTableDeps, 'tablePath' | 'readTable'>,
): Promise<string | null> => {
	const path = getTablePath(deps);
	const read = deps.readTable ?? defaultReadTable;
	let missing = 0;
	let lastError: unknown;
	for (let attempt = 0; attempt < READ_ATTEMPTS; attempt += 1) {
		try {
			return await read(path);
		} catch (error) {
			lastError = error;
			const code = errorCode(error);
			if (code === 'ENOENT' || code === 'ENOTDIR') {
				missing += 1;
				if (missing >= 2) return null;
			}
		}
		await pause(READ_RETRY_MS);
	}
	if (missing > 0 && errorCode(lastError) === 'ENOENT') return null;
	throw new FileLockTableUnreadableError(
		path,
		lastError instanceof Error ? lastError.message : String(lastError),
	);
};

/**
 * Read the table. A table that does not parse is refused: a caller that
 * holds the table's mutex and is about to write it passes
 * `onCorrupt: 'quarantine'`, which moves the bytes aside first so the
 * next claim starts from an honest empty table; a reader leaves them.
 */
export const readDocument = async (
	deps: Pick<IFileLockTableDeps, 'tablePath' | 'readTable' | 'onCorrupt'>,
	options: { readonly onCorrupt?: 'throw' | 'quarantine' } = {},
): Promise<ReturnType<typeof emptyDocument>> => {
	const onCorrupt = options.onCorrupt ?? deps.onCorrupt ?? 'throw';
	const raw = await readTableText(deps);
	if (raw === null) return emptyDocument();
	let parsed: unknown;
	try {
		parsed = JSON.parse(raw) as unknown;
	} catch (error) {
		const path = getTablePath(deps);
		const reason = error instanceof Error ? error.message : String(error);
		throw new FileLockTableUnreadableError(
			path,
			reason,
			onCorrupt === 'quarantine'
				? ((await quarantineCorruptFile(path)) ?? undefined)
				: undefined,
		);
	}
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

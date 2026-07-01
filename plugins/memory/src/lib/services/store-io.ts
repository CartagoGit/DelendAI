/**
 * store-io.ts — pure file I/O for the note store (read + write).
 *
 * SRP — only file I/O. No business logic, no ranking, no quota, no
 * redacting, no import/export. The other store modules consume this
 * for the actual disk touch; this module is the only place that
 * imports `node:fs/promises`.
 *
 * DIP — the caller passes the `absPath`. Tests inject a fake path
 * and a fake file system (via the `INoteReader`/`INoteWriter`
 * interfaces the test harness provides). The production wiring uses
 * the real `readFile` / `writeFileAtomic`.
 */
import { readFile } from 'node:fs/promises';

import {
	CorruptFileError,
	quarantineCorruptFile,
	withFileMutex,
	writeFileAtomic,
} from '@mcp-vertex/core/public';

import type { INote } from './store-types';

/**
 * Quarantine a corrupt store and throw — `quarantineCorruptFile`
 * moves the bad bytes to `<name>.corrupt-<ts>` so an agent never
 * silently reads (or overwrites) an empty store.
 */
const quarantine = async (absPath: string, detail: string): Promise<never> => {
	const backup = await quarantineCorruptFile(absPath);
	throw new CorruptFileError(absPath, backup, detail);
};

/**
 * Read the note store (JSON array). Missing/empty → empty list.
 * Corrupt → preserve the bytes (.corrupt-<ts>) and throw CorruptFileError
 * so the caller surfaces it instead of silently losing every note.
 * Async I/O so the read never blocks the MCP server's event loop. [A1]
 */
export const readStore = async (absPath: string): Promise<INote[]> => {
	let raw: string;
	try {
		raw = await readFile(absPath, 'utf8');
	} catch (err) {
		if ((err as NodeJS.ErrnoException).code === 'ENOENT') return [];
		throw err;
	}
	if (!raw.trim()) return [];

	let parsed: unknown;
	try {
		parsed = JSON.parse(raw);
	} catch (err) {
		return quarantine(absPath, `invalid JSON: ${String(err)}`);
	}
	if (
		typeof parsed !== 'object' ||
		parsed === null ||
		!Array.isArray((parsed as { notes?: unknown }).notes)
	) {
		return quarantine(absPath, 'expected { notes: [...] }');
	}
	// Lazy TTL: expired notes are dropped on read (and so pruned the next
	// time the store is rewritten), so recall/list never surface a stale note.
	const nowIso = new Date().toISOString();
	return (parsed as { notes: INote[] }).notes.filter(
		(note) => note.expiresAt === undefined || note.expiresAt > nowIso,
	);
};

export const writeStore = async (
	absPath: string,
	notes: readonly INote[],
): Promise<void> => {
	await writeFileAtomic(
		absPath,
		`${JSON.stringify({ notes }, null, '\t')}\n`,
	);
};

/**
 * Run a function inside the per-file mutex (writeFileAtomic already
 * serialises one path, but the read-modify-write cycle of `saveNote`
 * needs the lock to be held for both reads). Open/Closed: callers
 * (records, portable) compose this without re-implementing the lock.
 */
export const withStoreLock = <T>(
	absPath: string,
	fn: () => Promise<T>,
): Promise<T> => withFileMutex(absPath, fn);

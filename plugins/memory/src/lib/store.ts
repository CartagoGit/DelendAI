import { existsSync, readFileSync } from 'node:fs';

import {
	CorruptFileError,
	quarantineCorruptFileSync,
	withFileMutex,
	writeFileAtomicSync,
} from '@cartago-git/mcp-core/public';

import { rankNotes } from './rank';

export interface INote {
	readonly id: string;
	readonly title: string;
	readonly body: string;
	readonly tags: readonly string[];
	readonly createdAt: string;
	readonly updatedAt: string;
}

const kebab = (value: string): string =>
	value
		.trim()
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-+|-+$/g, '');

/** Maximum number of notes the store keeps (total-store quota). */
export const MAX_NOTES = 1000;

/** Derive a note's stable id from its title (so saves upsert by title). */
export const deriveNoteId = (title: string): string =>
	kebab(title) || `note-${Date.now().toString(36)}`;

const quarantine = (absPath: string, detail: string): never => {
	const backup = quarantineCorruptFileSync(absPath);
	throw new CorruptFileError(absPath, backup, detail);
};

/**
 * Read the note store (JSON array). Missing/empty → empty list.
 * Corrupt → preserve the bytes (.corrupt-<ts>) and throw CorruptFileError
 * so the caller surfaces it instead of silently losing every note.
 */
export const readStore = (absPath: string): INote[] => {
	if (!existsSync(absPath)) return [];
	const raw = readFileSync(absPath, 'utf8');
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
	return (parsed as { notes: INote[] }).notes;
};

export const writeStore = (absPath: string, notes: readonly INote[]): void => {
	writeFileAtomicSync(absPath, `${JSON.stringify({ notes }, null, '\t')}\n`);
};

/**
 * Upsert a note by id (derived from its title), so "save note titled X"
 * updates X instead of duplicating it. Returns the stored note.
 */
export const saveNote = (
	absPath: string,
	input: { title: string; body: string; tags?: readonly string[] },
	now: () => string = () => new Date().toISOString()
): Promise<INote> =>
	// Cross-process critical section: a single read-modify-write so two
	// agents saving concurrently can't clobber each other's note.
	withFileMutex(absPath, async () => {
		const id = deriveNoteId(input.title);
		const notes = readStore(absPath);
		const existing = notes.find((note) => note.id === id);
		const stamp = now();
		const note: INote = {
			id,
			title: input.title,
			body: input.body,
			tags: input.tags ?? [],
			createdAt: existing?.createdAt ?? stamp,
			updatedAt: stamp,
		};
		const next = existing
			? notes.map((candidate) => (candidate.id === id ? note : candidate))
			: [...notes, note];
		writeStore(absPath, next);
		return note;
	});

/**
 * Recall notes by free-text query and/or tags.
 * - `tags` is a hard filter (a note must carry all of them).
 * - With a `query`, results are ranked by lexical relevance (BM25-lite,
 *   see `rank.ts`), tie-broken by recency. Without one, newest first.
 */
export const recall = (
	absPath: string,
	options: { query?: string; tags?: readonly string[]; limit?: number } = {}
): INote[] => {
	const rawQuery = options.query?.trim() ?? '';
	const tags = options.tags ?? [];
	const limit = options.limit ?? 10;

	const filtered = readStore(absPath).filter(
		(note) => tags.length === 0 || tags.every((tag) => note.tags.includes(tag))
	);

	if (rawQuery.length === 0) {
		return [...filtered]
			.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
			.slice(0, limit);
	}

	return rankNotes(filtered, rawQuery)
		.filter((r) => r.score > 0)
		.sort(
			(a, b) =>
				b.score - a.score ||
				b.note.updatedAt.localeCompare(a.note.updatedAt)
		)
		.slice(0, limit)
		.map((r) => r.note);
};

export const removeNote = (absPath: string, id: string): Promise<boolean> =>
	withFileMutex(absPath, async () => {
		const notes = readStore(absPath);
		const next = notes.filter((note) => note.id !== id);
		if (next.length === notes.length) return false;
		writeStore(absPath, next);
		return true;
	});

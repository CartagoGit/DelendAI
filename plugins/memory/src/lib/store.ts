import { readFile } from 'node:fs/promises';

import {
	CorruptFileError,
	quarantineCorruptFile,
	withFileMutex,
	writeFileAtomic,
} from '@mcp-vertex/core/public';

import { rankNotes } from './rank';
import { redactSecrets } from './redact';

export interface INote {
	readonly id: string;
	readonly title: string;
	readonly body: string;
	readonly tags: readonly string[];
	readonly createdAt: string;
	readonly updatedAt: string;
	/** ISO timestamp after which the note is expired (TTL). Absent = never. */
	readonly expiresAt?: string;
}

export interface ISaveResult {
	readonly note: INote;
	/** How many secrets were redacted from title/body/tags before saving. */
	readonly redactions: number;
}

const kebab = (value: string): string =>
	value
		.trim()
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-+|-+$/g, '');

/** Default for the total-store quota when the plugin options don't
 * override it. Kept as a constant (not `export const MAX_NOTES`) so
 * callers go through `getMaxNotes(options)` instead of importing the
 * raw constant — this is the SOLID hook that makes the limit
 * configurable from `mcp-vertex.config.json#plugins.memory.options.maxNotes`.
 */
export const DEFAULT_MAX_NOTES = 1000;

/**
 * Resolve the effective max-notes limit for one save. Honours an
 * explicit override from `tools.ts` (passed through from the plugin
 * `optionsSchema`); falls back to {@link DEFAULT_MAX_NOTES}.
 */
export const getMaxNotes = (override?: number): number =>
	typeof override === 'number' && override > 0 ? override : DEFAULT_MAX_NOTES;

/** Derive a note's stable id from its title (so saves upsert by title). */
export const deriveNoteId = (title: string): string =>
	kebab(title) || `note-${Date.now().toString(36)}`;

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
	// Lazy TTL: expired notes are dropped on read (and so pruned the next time
	// the store is rewritten), so recall/list never surface a stale note.
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
 * Upsert a note by id (derived from its title), so "save note titled X"
 * updates X instead of duplicating it. Returns the stored note.
 */
export const saveNote = (
	absPath: string,
	input: {
		title: string;
		body: string;
		tags?: readonly string[];
		/** Time-to-live in seconds. The note expires (and is pruned) after it. */
		ttlSeconds?: number;
	},
	now: () => string = () => new Date().toISOString(),
): Promise<ISaveResult> =>
	// Cross-process critical section: a single read-modify-write so two
	// agents saving concurrently can't clobber each other's note.
	withFileMutex(absPath, async () => {
		// Scrub secrets BEFORE anything touches disk (M11): memory is durable.
		const titleR = redactSecrets(input.title);
		const bodyR = redactSecrets(input.body);
		const tagsR = (input.tags ?? []).map((tag) => redactSecrets(tag));
		const redactions =
			titleR.redactions +
			bodyR.redactions +
			tagsR.reduce((sum, t) => sum + t.redactions, 0);

		const id = deriveNoteId(titleR.text);
		const notes = await readStore(absPath);
		const existing = notes.find((note) => note.id === id);
		const stamp = now();
		// A fresh ttl wins; otherwise an update keeps the prior expiry.
		const expiresAt =
			input.ttlSeconds !== undefined
				? new Date(
						Date.parse(stamp) + input.ttlSeconds * 1000,
					).toISOString()
				: existing?.expiresAt;
		const note: INote = {
			id,
			title: titleR.text,
			body: bodyR.text,
			tags: tagsR.map((t) => t.text),
			createdAt: existing?.createdAt ?? stamp,
			updatedAt: stamp,
			...(expiresAt !== undefined ? { expiresAt } : {}),
		};
		const next = existing
			? notes.map((candidate) => (candidate.id === id ? note : candidate))
			: [...notes, note];
		await writeStore(absPath, next);
		return { note, redactions };
	});

/**
 * Recall notes by free-text query and/or tags.
 * - `tags` is a hard filter (a note must carry all of them).
 * - With a `query`, results are ranked by lexical relevance (BM25-lite,
 *   see `rank.ts`), tie-broken by recency. Without one, newest first.
 */
export const recall = async (
	absPath: string,
	options: {
		query?: string;
		tags?: readonly string[];
		limit?: number;
		bm25K1?: number;
		bm25B?: number;
		titleWeight?: number;
	} = {},
): Promise<INote[]> => {
	const rawQuery = options.query?.trim() ?? '';
	const tags = options.tags ?? [];
	const limit = options.limit ?? 10;

	const filtered = (await readStore(absPath)).filter(
		(note) =>
			tags.length === 0 || tags.every((tag) => note.tags.includes(tag)),
	);

	if (rawQuery.length === 0) {
		return [...filtered]
			.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
			.slice(0, limit);
	}

	return rankNotes(filtered, rawQuery, {
		...(options.bm25K1 !== undefined ? { bm25K1: options.bm25K1 } : {}),
		...(options.bm25B !== undefined ? { bm25B: options.bm25B } : {}),
		...(options.titleWeight !== undefined
			? { titleWeight: options.titleWeight }
			: {}),
	})
		.filter((r) => r.score > 0)
		.sort(
			(a, b) =>
				b.score - a.score ||
				b.note.updatedAt.localeCompare(a.note.updatedAt),
		)
		.slice(0, limit)
		.map((r) => r.note);
};

export const removeNote = (absPath: string, id: string): Promise<boolean> =>
	withFileMutex(absPath, async () => {
		const notes = await readStore(absPath);
		const next = notes.filter((note) => note.id !== id);
		if (next.length === notes.length) return false;
		await writeStore(absPath, next);
		return true;
	});

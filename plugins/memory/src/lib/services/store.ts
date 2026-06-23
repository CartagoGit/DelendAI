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

/**
 * Derive a note's stable id from its title (so saves upsert by title).
 * Titles are therefore part of the durable memory contract: the store is for
 * stable reusable facts, not ephemeral log entries that should accumulate.
 */
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
 * updates X instead of duplicating it. The store is intentionally biased
 * toward durable distilled notes: overwrite a stable fact, don't append a
 * running transcript. Returns the stored note.
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
		// Scrub secrets BEFORE anything touches disk: memory is durable.
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

export type IMemoryExportFormat = 'json' | 'ndjson';

/**
 * Read the store with expired notes included or excluded. `readStore`
 * always drops expired notes (the contract every other caller relies on);
 * `includeExpired: true` re-parses the same bytes once more without the
 * TTL filter, falling back to the already-filtered list on any read
 * error (ENOENT, empty file, corrupt JSON) since `readStore` itself is
 * the source of truth for error handling — this helper only ever widens
 * the result, never narrows it past what `readStore` already validated.
 */
const readStoreForExport = async (
	absPath: string,
	includeExpired: boolean,
): Promise<INote[]> => {
	const filtered = await readStore(absPath);
	if (!includeExpired) return filtered;
	try {
		const raw = await readFile(absPath, 'utf8');
		if (!raw.trim()) return filtered;
		const parsed = JSON.parse(raw) as { notes?: INote[] };
		return Array.isArray(parsed.notes) ? parsed.notes : filtered;
	} catch {
		return filtered;
	}
};

/**
 * Serialise the store to a portable snapshot. `format: 'ndjson'` emits one
 * JSON object per line (streamable, diff-friendly); `'json'` emits a single
 * `{ notes: [...] }` document (matches the on-disk shape, easy to re-import
 * elsewhere). Expired notes are excluded by default — pass
 * `includeExpired: true` to keep them (e.g. for an audit trail).
 */
export const exportNotes = async (
	absPath: string,
	options: { format: IMemoryExportFormat; includeExpired?: boolean },
): Promise<{ payload: string; count: number }> => {
	const notes = await readStoreForExport(
		absPath,
		options.includeExpired ?? false,
	);
	const ordered = [...notes].sort((a, b) => a.id.localeCompare(b.id));
	const payload =
		options.format === 'ndjson'
			? ordered.map((note) => JSON.stringify(note)).join('\n')
			: JSON.stringify({ notes: ordered }, null, '\t');
	return { payload, count: ordered.length };
};

export type IMemoryImportMode = 'replace' | 'merge';
export type IMemoryImportConflict = 'overwrite' | 'skip' | 'merge';

export interface IMemoryImportResult {
	readonly imported: number;
	readonly skipped: number;
	readonly overwritten: number;
	readonly merged: number;
	readonly total: number;
	readonly redactedSecrets: number;
}

const isPlainNoteShape = (value: unknown): value is Record<string, unknown> =>
	typeof value === 'object' &&
	value !== null &&
	typeof (value as { id?: unknown }).id === 'string' &&
	typeof (value as { title?: unknown }).title === 'string' &&
	typeof (value as { body?: unknown }).body === 'string';

/**
 * Parse an export payload back into note candidates. Accepts the same two
 * shapes {@link exportNotes} produces (`{ notes: [...] }` JSON or one
 * JSON object per NDJSON line); throws a descriptive error on malformed
 * input rather than quarantining (the import payload isn't the durable
 * store — quarantine is for the on-disk file, not an inbound parameter).
 */
const parseImportPayload = (
	payload: string,
	format: IMemoryImportFormat,
): Record<string, unknown>[] => {
	if (format === 'ndjson') {
		return payload
			.split('\n')
			.map((line) => line.trim())
			.filter((line) => line.length > 0)
			.map((line, idx) => {
				let parsed: unknown;
				try {
					parsed = JSON.parse(line);
				} catch (err) {
					throw new Error(
						`invalid NDJSON on line ${idx + 1}: ${String(err)}`,
					);
				}
				if (!isPlainNoteShape(parsed)) {
					throw new Error(
						`line ${idx + 1} is not a note (missing id/title/body)`,
					);
				}
				return parsed;
			});
	}
	let parsed: unknown;
	try {
		parsed = JSON.parse(payload);
	} catch (err) {
		throw new Error(`invalid JSON import payload: ${String(err)}`);
	}
	const notes = (parsed as { notes?: unknown }).notes;
	if (!Array.isArray(notes)) {
		throw new Error('expected { notes: [...] } at the top level');
	}
	notes.forEach((candidate, idx) => {
		if (!isPlainNoteShape(candidate)) {
			throw new Error(
				`notes[${idx}] is not a note (missing id/title/body)`,
			);
		}
	});
	return notes as Record<string, unknown>[];
};

export type IMemoryImportFormat = IMemoryExportFormat;

/** Redact secrets from a candidate note's text fields before it ever touches disk. */
const redactCandidate = (
	candidate: Record<string, unknown>,
): { note: INote; redactions: number } => {
	const titleR = redactSecrets(String(candidate.title ?? ''));
	const bodyR = redactSecrets(String(candidate.body ?? ''));
	const tags = Array.isArray(candidate.tags)
		? (candidate.tags as unknown[]).map((tag) => String(tag))
		: [];
	const tagsR = tags.map((tag) => redactSecrets(tag));
	const redactions =
		titleR.redactions +
		bodyR.redactions +
		tagsR.reduce((sum, t) => sum + t.redactions, 0);
	const note: INote = {
		id: String(candidate.id),
		title: titleR.text,
		body: bodyR.text,
		tags: tagsR.map((t) => t.text),
		createdAt:
			typeof candidate.createdAt === 'string'
				? candidate.createdAt
				: new Date().toISOString(),
		updatedAt:
			typeof candidate.updatedAt === 'string'
				? candidate.updatedAt
				: new Date().toISOString(),
		...(typeof candidate.expiresAt === 'string'
			? { expiresAt: candidate.expiresAt }
			: {}),
	};
	return { note, redactions };
};

/** Merge two notes for `conflict: 'merge'`: union tags, keep the longer body, newest timestamps win. */
const mergeNotes = (existing: INote, incoming: INote): INote => ({
	id: existing.id,
	title: incoming.title,
	body:
		incoming.body.length >= existing.body.length
			? incoming.body
			: existing.body,
	tags: Array.from(new Set([...existing.tags, ...incoming.tags])),
	createdAt: existing.createdAt,
	updatedAt:
		incoming.updatedAt > existing.updatedAt
			? incoming.updatedAt
			: existing.updatedAt,
	...(incoming.expiresAt !== undefined
		? { expiresAt: incoming.expiresAt }
		: existing.expiresAt !== undefined
			? { expiresAt: existing.expiresAt }
			: {}),
});

/**
 * Import a previously exported snapshot into the store. `mode: 'replace'`
 * discards the current store entirely (destructive — callers must mark the
 * tool `effects: ['write', 'destructive']`); `mode: 'merge'` keeps existing
 * notes and applies `conflict` per colliding id: `'overwrite'` (incoming
 * wins), `'skip'` (existing wins) or `'merge'` (union tags, longer body,
 * newest timestamps). Every incoming field runs through {@link redactSecrets}
 * before it's written, matching `memory_save`'s guarantee that secrets never
 * reach disk.
 */
export const importNotes = (
	absPath: string,
	payload: string,
	options: {
		format: IMemoryImportFormat;
		mode: IMemoryImportMode;
		conflict?: IMemoryImportConflict;
	},
): Promise<IMemoryImportResult> =>
	withFileMutex(absPath, async () => {
		const conflict = options.conflict ?? 'overwrite';
		const candidates = parseImportPayload(payload, options.format);
		const existing =
			options.mode === 'replace' ? [] : await readStore(absPath);
		const byId = new Map(existing.map((note) => [note.id, note]));

		let imported = 0;
		let skipped = 0;
		let overwritten = 0;
		let merged = 0;
		let redactedSecrets = 0;

		for (const candidate of candidates) {
			const { note, redactions } = redactCandidate(candidate);
			redactedSecrets += redactions;
			const current = byId.get(note.id);
			if (!current) {
				byId.set(note.id, note);
				imported += 1;
				continue;
			}
			if (options.mode === 'replace') {
				// mode:'replace' already started from an empty map, so a
				// collision here means two candidates in the SAME payload
				// share an id — last one wins, counted as an overwrite.
				byId.set(note.id, note);
				overwritten += 1;
				continue;
			}
			if (conflict === 'skip') {
				skipped += 1;
				continue;
			}
			if (conflict === 'merge') {
				byId.set(note.id, mergeNotes(current, note));
				merged += 1;
				continue;
			}
			byId.set(note.id, note); // 'overwrite'
			overwritten += 1;
		}

		const next = Array.from(byId.values());
		await writeStore(absPath, next);
		return {
			imported,
			skipped,
			overwritten,
			merged,
			total: next.length,
			redactedSecrets,
		};
	});

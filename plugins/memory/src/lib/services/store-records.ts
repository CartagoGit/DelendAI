/**
 * store-records.ts — CRUD on individual notes (save, remove, derive id,
 * quota). Owns the "stable fact per title" contract: notes upsert by
 * id, not append, so `save note titled X` updates X.
 *
 * SRP — separate from `store-io.ts` (file I/O), `store-recall.ts`
 * (BM25 ranking) and `store-portable.ts` (export/import). The CRUD
 * operations are the only ones that need the read-modify-write
 * `withFileMutex` cycle.
 *
 * Redaction is intentionally a side effect of `saveNote` here, not
 * extracted: the secret-scrubbing happens on the in-memory copy
 * before the note ever touches disk, and that guarantee is part of
 * the durable-memory contract. Moving redaction to a separate module
 * would risk a future caller forgetting to apply it.
 */
import { redactSecrets } from './redact';
import { readStore, withStoreLock, writeStore } from './store-io';
import { DEFAULT_MAX_NOTES, type INote, type ISaveResult } from './store-types';

const kebab = (value: string): string =>
	value
		.trim()
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-+|-+$/g, '');

/**
 * Resolve the effective max-notes limit for one save. Honours an
 * explicit override from `tools.ts` (passed through from the plugin
 * `optionsSchema`); falls back to {@link DEFAULT_MAX_NOTES}.
 */
export const getMaxNotes = (override?: number): number =>
	typeof override === 'number' && override > 0 ? override : DEFAULT_MAX_NOTES;

/**
 * Derive a note's stable id from its title (so saves upsert by title).
 * Titles are therefore part of the durable memory contract: the store
 * is for stable reusable facts, not ephemeral log entries that should
 * accumulate.
 */
export const deriveNoteId = (title: string): string =>
	kebab(title) || `note-${Date.now().toString(36)}`;

/**
 * Upsert a note by id (derived from its title). Returns the stored note.
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
	withStoreLock(absPath, async () => {
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
 * Delete one note by id. Returns `true` if a note was removed, `false`
 * if no note with that id existed (so the caller can surface a
 * structured tool error rather than a silent no-op).
 */
export const removeNote = (absPath: string, id: string): Promise<boolean> =>
	withStoreLock(absPath, async () => {
		const notes = await readStore(absPath);
		const next = notes.filter((note) => note.id !== id);
		if (next.length === notes.length) return false;
		await writeStore(absPath, next);
		return true;
	});

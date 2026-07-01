/**
 * store-portable.ts — export/import the store as a portable snapshot.
 *
 * SRP — owns only the "serialise to / from a string payload" concern.
 * It composes `readStore` / `writeStore` from `./store-io.ts` and the
 * CRUD helpers from `./store-records.ts`. No ranking, no quota.
 *
 * Open/Closed — new export formats (yaml, csv, base64) are added by
 * appending a new branch in `exportNotes` and a new parser in
 * `parseImportPayload`. The merge conflict resolution policy is
 * also pluggable via the `IMemoryImportConflict` union.
 */
import { readFile } from 'node:fs/promises';

import { redactSecrets } from './redact';
import { readStore, withStoreLock, writeStore } from './store-io';
import type { INote } from './store-types';

export type IMemoryExportFormat = 'json' | 'ndjson';
export type IMemoryImportFormat = IMemoryExportFormat;
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

/**
 * Read the store with expired notes included or excluded. `readStore`
 * always drops expired notes (the contract every other caller relies
 * on); `includeExpired: true` re-parses the same bytes once more
 * without the TTL filter.
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
 * Serialise the store to a portable snapshot. `format: 'ndjson'`
 * emits one JSON object per line (streamable, diff-friendly); `'json'`
 * emits a single `{ notes: [...] }` document. Expired notes are
 * excluded by default — pass `includeExpired: true` to keep them.
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

const isPlainNoteShape = (value: unknown): value is Record<string, unknown> =>
	typeof value === 'object' &&
	value !== null &&
	typeof (value as { id?: unknown }).id === 'string' &&
	typeof (value as { title?: unknown }).title === 'string' &&
	typeof (value as { body?: unknown }).body === 'string';

/**
 * Parse an export payload back into note candidates. Accepts the same
 * two shapes {@link exportNotes} produces (`{ notes: [...] }` JSON or
 * one JSON object per NDJSON line); throws a descriptive error on
 * malformed input rather than quarantining (the import payload isn't
 * the durable store — quarantine is for the on-disk file, not an
 * inbound parameter).
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

/** Redact secrets from a candidate note's text fields before it ever
 *  touches disk. */
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

/** Merge two notes for `conflict: 'merge'`: union tags, keep the
 *  longer body, newest timestamps win. */
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
 * Import a previously exported snapshot into the store. `mode:
 * 'replace'` discards the current store entirely; `mode: 'merge'`
 * keeps existing notes and applies `conflict` per colliding id.
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
	withStoreLock(absPath, async () => {
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

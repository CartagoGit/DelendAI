import { existsSync, readFileSync } from 'node:fs';

import { writeFileAtomicSync } from '@cartago-git/mcp-core/public';

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

/** Read the note store (JSON array). Missing/corrupt → empty. */
export const readStore = (absPath: string): INote[] => {
	if (!existsSync(absPath)) return [];
	try {
		const parsed = JSON.parse(readFileSync(absPath, 'utf8')) as {
			notes?: INote[];
		};
		return Array.isArray(parsed.notes) ? parsed.notes : [];
	} catch {
		return [];
	}
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
): INote => {
	const id = kebab(input.title) || `note-${Date.now().toString(36)}`;
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
};

/** Recall notes by free-text query and/or tags. Newest first. */
export const recall = (
	absPath: string,
	options: { query?: string; tags?: readonly string[]; limit?: number } = {}
): INote[] => {
	const query = options.query?.toLowerCase().trim();
	const tags = options.tags ?? [];
	const matches = readStore(absPath).filter((note) => {
		const textOk =
			query === undefined ||
			query.length === 0 ||
			note.title.toLowerCase().includes(query) ||
			note.body.toLowerCase().includes(query);
		const tagsOk =
			tags.length === 0 || tags.every((tag) => note.tags.includes(tag));
		return textOk && tagsOk;
	});
	matches.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
	return matches.slice(0, options.limit ?? 10);
};

export const removeNote = (absPath: string, id: string): boolean => {
	const notes = readStore(absPath);
	const next = notes.filter((note) => note.id !== id);
	if (next.length === notes.length) return false;
	writeStore(absPath, next);
	return true;
};

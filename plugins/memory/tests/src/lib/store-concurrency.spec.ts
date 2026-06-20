/**
 * store-concurrency.spec.ts (M32, p111 s4)
 *
 * `saveNote` is the only public mutation path on the notes store.
 * Its correctness under concurrent writers is a contract: two agents
 * racing to remember two different facts must not silently drop one.
 * The acceptance criterion for M32 is:
 *
 *     "N escritores paralelos bajo `withFileMutex` no pierden
 *      ninguna actualización."
 *
 * Design (SOLID): the suite depends ONLY on the public surface of
 * the store (`saveNote`, `removeNote`, `readStore`, `INote`). It
 * never touches `node:fs`, `withFileMutex` or `writeFileAtomic`
 * directly — those are implementation details the plugin is free
 * to swap (e.g. SQLite-WAL) without breaking this contract (DIP).
 * Each test owns its own scratch dir via `mkdtempSync`, so cases
 * stay independent and parallelizable within the suite (SRP/ISP).
 */
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
	readStore,
	removeNote,
	saveNote,
} from '@mcp-vertex/memory/lib/store';

describe('memory store concurrency (M32, p111 s4)', () => {
	let dir = '';
	let store = '';
	beforeEach(() => {
		dir = mkdtempSync(join(tmpdir(), 'mem-conc-'));
		store = join(dir, 'notes.json');
	});
	afterEach(() => rmSync(dir, { recursive: true, force: true }));

	it('persists every note when N writers save in parallel with distinct titles', async () => {
		const N = 32;
		const titles = Array.from(
			{ length: N },
			(_, i) => `parallel-note-${i}`,
		);
		// Fire all writes at once and await Promise.all to surface any
		// rejection — `saveNote` must never silently drop one.
		await Promise.all(
			titles.map((title) =>
				saveNote(store, {
					title,
					body: `body for ${title}`,
					tags: ['concurrency'],
				}),
			),
		);
		const notes = await readStore(store);
		expect(notes).toHaveLength(N);
		const persistedTitles = new Set(notes.map((n) => n.title));
		for (const title of titles) {
			expect(persistedTitles.has(title)).toBe(true);
		}
	});

	it('upserts (does not duplicate) when N writers race the same title', async () => {
		const N = 16;
		const sharedTitle = 'shared-title';
		await Promise.all(
			Array.from({ length: N }, (_, i) =>
				saveNote(store, {
					title: sharedTitle,
					body: `revision-${i}`,
				}),
			),
		);
		const notes = await readStore(store);
		expect(notes).toHaveLength(1);
		// The length assertion narrows `notes[0]` for the typechecker, but
		// exactOptionalPropertyTypes + strict mode still want an explicit
		// guard so this stays safe if the contract ever changes.
		const only = notes[0];
		if (!only) throw new Error('expected exactly one note after the race');
		expect(only.title).toBe(sharedTitle);
		// The surviving body must come from one of the racing revisions —
		// the assertion that matters is that NO revision was lost without
		// being either persisted or overwritten deterministically.
		expect(only.body).toMatch(/^revision-\d+$/);
	});

	it('sequential and parallel saves converge to the same set of notes', async () => {
		const titles = Array.from({ length: 20 }, (_, i) => `converge-${i}`);

		// Sequential baseline.
		for (const title of titles) {
			await saveNote(store, { title, body: title });
		}
		const sequential = (await readStore(store)).map((n) => n.id).sort();

		// Fresh dir, same workload, fired in parallel.
		const dir2 = mkdtempSync(join(tmpdir(), 'mem-conc-'));
		const store2 = join(dir2, 'notes.json');
		try {
			await Promise.all(
				titles.map((title) => saveNote(store2, { title, body: title })),
			);
			const parallel = (await readStore(store2)).map((n) => n.id).sort();
			expect(parallel).toEqual(sequential);
		} finally {
			rmSync(dir2, { recursive: true, force: true });
		}
	});

	it('preserves notes that concurrent deletes did not target', async () => {
		// Seed N notes serially so the test is deterministic on the input set.
		const N = 24;
		const seeded = Array.from({ length: N }, (_, i) => `seed-${i}`);
		for (const title of seeded) {
			await saveNote(store, { title, body: title });
		}
		expect(await readStore(store)).toHaveLength(N);

		// Race: half the writers save new notes, the other half delete the
		// odd-indexed seeds. After the dust settles, every EVEN-indexed
		// seed must still be there, and every NEW note must be present.
		const toDelete = seeded.filter((_, i) => i % 2 === 1);
		const newNotes = Array.from({ length: N / 2 }, (_, i) => `fresh-${i}`);
		await Promise.all([
			...toDelete.map((title) => removeNote(store, title)),
			...newNotes.map((title) => saveNote(store, { title, body: title })),
		]);

		const after = await readStore(store);
		const titlesAfter = new Set(after.map((n) => n.title));

		// Every even-indexed seed survives.
		for (let i = 0; i < N; i += 1) {
			if (i % 2 === 0) {
				expect(titlesAfter.has(seeded[i]!)).toBe(true);
			} else {
				expect(titlesAfter.has(seeded[i]!)).toBe(false);
			}
		}
		// Every new note lands.
		for (const title of newNotes) {
			expect(titlesAfter.has(title)).toBe(true);
		}
		// Total = (N/2 surviving seeds) + (N/2 new notes) = N.
		expect(after).toHaveLength(N);
	});
});

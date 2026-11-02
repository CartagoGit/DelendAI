/**
 * one-record-per-note.spec.ts — ids never merge two notes, a rewritten
 * checkpoint counts as fresh, and an import refuses fields it cannot trust.
 */
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { refreshCheckpointFreshnessAdvisory } from '@delendai/memory/lib/services/checkpoint-freshness';
import {
	importNotes,
	readStore,
	saveNote,
} from '@delendai/memory/lib/services/store';

describe('memory keeps one record per note', () => {
	let dir = '';
	let store = '';
	beforeEach(() => {
		dir = mkdtempSync(join(tmpdir(), 'mem-one-'));
		store = join(dir, 'notes.json');
	});
	afterEach(() => rmSync(dir, { recursive: true, force: true }));

	it('keeps two titles with the same slug as two notes', async () => {
		const first = await saveNote(store, { title: 'release/v1', body: 'a' });
		const second = await saveNote(store, {
			title: 'release-v1',
			body: 'b',
		});
		expect(second.note.id).not.toBe(first.note.id);
		expect(await readStore(store)).toHaveLength(2);
		const again = await saveNote(store, { title: 'release/v1', body: 'c' });
		expect(again.note.id).toBe(first.note.id);
		expect(await readStore(store)).toHaveLength(2);
	});

	it('counts a rewritten checkpoint as fresh', async () => {
		await saveNote(
			store,
			{ title: 'session-digest:t', body: 'old' },
			() => '2026-01-01T00:00:00.000Z',
		);
		await saveNote(
			store,
			{ title: 'session-digest:t', body: 'new' },
			() => '2026-01-01T01:00:00.000Z',
		);
		const nowMs = Date.parse('2026-01-01T01:05:00.000Z');
		const { freshness } = await refreshCheckpointFreshnessAdvisory(store, {
			nowMs,
		});
		expect(freshness.state).toBe('fresh');
	});

	it('refuses invalid timestamps and tags on import', async () => {
		const note = { id: 'a', title: 'A', body: 'b' };
		const run = (extra: Record<string, unknown>) =>
			importNotes(
				store,
				JSON.stringify({ notes: [{ ...note, ...extra }] }),
				{
					format: 'json',
					mode: 'merge',
				},
			);
		await expect(run({ createdAt: 'garbage' })).rejects.toThrow(
			/createdAt/,
		);
		await expect(run({ updatedAt: 7 })).rejects.toThrow(/updatedAt/);
		await expect(run({ tags: ['ok', 3] })).rejects.toThrow(/tags/);
		await expect(run({ tags: 'x' })).rejects.toThrow(/tags/);
		expect(await readStore(store)).toEqual([]);
		await expect(run({ tags: ['x'] })).resolves.toMatchObject({
			imported: 1,
		});
	});
});

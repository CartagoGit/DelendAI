/**
 * export-import.spec.ts (f00028 S2)
 *
 * memory_export / memory_import — round-trip portability of the note
 * store, with secret redaction on import and per-id conflict resolution.
 */
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
	exportNotes,
	importNotes,
	readStore,
	saveNote,
} from '@mcp-vertex/memory/lib/store';

const tok = (...parts: string[]): string => parts.join('');

describe('memory export/import (f00028 S2)', () => {
	let dir = '';
	let store = '';
	beforeEach(() => {
		dir = mkdtempSync(join(tmpdir(), 'mem-export-'));
		store = join(dir, 'notes.json');
	});
	afterEach(() => rmSync(dir, { recursive: true, force: true }));

	it('exports an empty store as an empty snapshot', async () => {
		const { payload, count } = await exportNotes(store, { format: 'json' });
		expect(count).toBe(0);
		expect(JSON.parse(payload)).toEqual({ notes: [] });
	});

	it('excludes expired notes by default, includes them with includeExpired', async () => {
		await saveNote(store, { title: 'Alive', body: 'still here' });
		await saveNote(
			store,
			{ title: 'Dead', body: 'gone', ttlSeconds: 1 },
			() => '2000-01-01T00:00:00.000Z', // far in the past relative to "now"
		);

		const excluding = await exportNotes(store, { format: 'json' });
		expect(excluding.count).toBe(1);
		expect(JSON.parse(excluding.payload).notes).toHaveLength(1);

		const including = await exportNotes(store, {
			format: 'json',
			includeExpired: true,
		});
		expect(including.count).toBe(2);
	});

	it('exports as NDJSON — one JSON object per line', async () => {
		await saveNote(store, { title: 'A', body: 'a' });
		await saveNote(store, { title: 'B', body: 'b' });
		const { payload, count } = await exportNotes(store, {
			format: 'ndjson',
		});
		expect(count).toBe(2);
		const lines = payload.split('\n');
		expect(lines).toHaveLength(2);
		for (const line of lines) {
			expect(() => JSON.parse(line)).not.toThrow();
		}
	});

	it('import mode "replace" discards the existing store first', async () => {
		await saveNote(store, { title: 'Old', body: 'will be gone' });
		const fresh = JSON.stringify({
			notes: [
				{
					id: 'new-note',
					title: 'New',
					body: 'fresh content',
					tags: [],
					createdAt: '2026-01-01T00:00:00.000Z',
					updatedAt: '2026-01-01T00:00:00.000Z',
				},
			],
		});
		const result = await importNotes(store, fresh, {
			format: 'json',
			mode: 'replace',
		});
		expect(result.imported).toBe(1);
		expect(result.total).toBe(1);
		const all = await readStore(store);
		expect(all.map((n) => n.id)).toEqual(['new-note']);
	});

	it('import mode "merge" with no id collisions adds every note', async () => {
		await saveNote(store, { title: 'Existing', body: 'stays' });
		const payload = JSON.stringify({
			notes: [
				{
					id: 'incoming-note',
					title: 'Incoming',
					body: 'added',
					tags: [],
					createdAt: '2026-01-01T00:00:00.000Z',
					updatedAt: '2026-01-01T00:00:00.000Z',
				},
			],
		});
		const result = await importNotes(store, payload, {
			format: 'json',
			mode: 'merge',
		});
		expect(result.imported).toBe(1);
		expect(result.total).toBe(2);
	});

	it('import merge with conflict "skip" keeps the existing note untouched', async () => {
		const { note } = await saveNote(store, {
			title: 'Existing',
			body: 'original body',
		});
		const payload = JSON.stringify({
			notes: [
				{
					...note,
					body: 'incoming body should be ignored',
				},
			],
		});
		const result = await importNotes(store, payload, {
			format: 'json',
			mode: 'merge',
			conflict: 'skip',
		});
		expect(result.skipped).toBe(1);
		expect(result.imported).toBe(0);
		const all = await readStore(store);
		expect(all[0]?.body).toBe('original body');
	});

	it('import merge with conflict "overwrite" replaces the existing note', async () => {
		const { note } = await saveNote(store, {
			title: 'Existing',
			body: 'original body',
		});
		const payload = JSON.stringify({
			notes: [{ ...note, body: 'overwritten body' }],
		});
		const result = await importNotes(store, payload, {
			format: 'json',
			mode: 'merge',
			conflict: 'overwrite',
		});
		expect(result.overwritten).toBe(1);
		const all = await readStore(store);
		expect(all[0]?.body).toBe('overwritten body');
	});

	it('import merge with conflict "merge" unions tags and keeps the longer body', async () => {
		const { note } = await saveNote(store, {
			title: 'Existing',
			body: 'short',
			tags: ['a'],
		});
		const payload = JSON.stringify({
			notes: [
				{
					...note,
					body: 'a much longer body than before',
					tags: ['b'],
				},
			],
		});
		const result = await importNotes(store, payload, {
			format: 'json',
			mode: 'merge',
			conflict: 'merge',
		});
		expect(result.merged).toBe(1);
		const all = await readStore(store);
		expect(all[0]?.body).toBe('a much longer body than before');
		expect(new Set(all[0]?.tags)).toEqual(new Set(['a', 'b']));
	});

	it('import redacts secrets in incoming notes before they touch disk', async () => {
		const secret = tok('AK', 'IA', 'IOSFODNN7EXAMPLE');
		const payload = JSON.stringify({
			notes: [
				{
					id: 'secret-note',
					title: 'Has secret',
					body: `value is ${secret} end`,
					tags: [],
					createdAt: '2026-01-01T00:00:00.000Z',
					updatedAt: '2026-01-01T00:00:00.000Z',
				},
			],
		});
		const result = await importNotes(store, payload, {
			format: 'json',
			mode: 'merge',
		});
		expect(result.redactedSecrets).toBeGreaterThanOrEqual(1);
		const all = await readStore(store);
		expect(all[0]?.body).not.toContain(secret);
	});

	it('round-trips export -> import preserving every non-expired note', async () => {
		await saveNote(store, { title: 'One', body: 'first', tags: ['x'] });
		await saveNote(store, { title: 'Two', body: 'second', tags: ['y'] });
		const { payload } = await exportNotes(store, { format: 'json' });

		const otherDir = mkdtempSync(join(tmpdir(), 'mem-export-dst-'));
		const otherStore = join(otherDir, 'notes.json');
		await importNotes(otherStore, payload, {
			format: 'json',
			mode: 'replace',
		});

		const original = await readStore(store);
		const restored = await readStore(otherStore);
		expect(restored.map((n) => n.id).sort()).toEqual(
			original.map((n) => n.id).sort(),
		);
		expect(restored.map((n) => n.body).sort()).toEqual(
			original.map((n) => n.body).sort(),
		);
		rmSync(otherDir, { recursive: true, force: true });
	});

	it('rejects malformed JSON import payload with a descriptive error', async () => {
		await expect(
			importNotes(store, '{not valid json', {
				format: 'json',
				mode: 'merge',
			}),
		).rejects.toThrow(/invalid JSON/);
	});

	it('rejects malformed NDJSON import payload with a descriptive error', async () => {
		await expect(
			importNotes(store, '{"id":"x","title":"t","body":"b"}\nnot json', {
				format: 'ndjson',
				mode: 'merge',
			}),
		).rejects.toThrow(/invalid NDJSON/);
	});
});

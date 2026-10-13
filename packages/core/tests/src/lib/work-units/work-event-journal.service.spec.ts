import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
	journalWorkEvent,
	workEventJournalPath,
} from '../../../../src/lib/work-units/work-event-journal.service';

describe('journalWorkEvent', () => {
	let root: string;

	beforeEach(async () => {
		root = await mkdtemp(join(tmpdir(), 'work-event-journal-'));
	});

	afterEach(async () => {
		await rm(root, { recursive: true, force: true });
	});

	it('appends one line in the shape the event bus stores', async () => {
		const recorded = await journalWorkEvent(
			root,
			{
				kind: 'slice_claimed',
				proposal: 'q00020',
				slice: 'S1',
				actor: 'claude-sonnet-5-5',
				detail: { unitKind: 'implement' },
			},
			() => 1234,
		);
		expect(recorded).toBe(true);
		const lines = (await readFile(workEventJournalPath(root), 'utf8'))
			.trim()
			.split('\n');
		expect(lines).toHaveLength(1);
		const line = JSON.parse(lines[0] ?? '') as Record<string, unknown>;
		expect(line).toMatchObject({
			work_item_id: 'q00020/S1',
			actor_id: 'claude-sonnet-5-5',
			kind: 'slice_claimed',
			created_at: 1234,
		});
		expect(String(line.payload_hash)).toMatch(/^[0-9a-f]{64}$/u);
	});

	it('hashes the same facts to the same value whatever their order', async () => {
		const base = {
			kind: 'slice_submitted',
			proposal: 'a',
			slice: 'b',
		} as const;
		await journalWorkEvent(root, {
			...base,
			actor: null,
			detail: { x: '1', y: '2' },
		});
		await journalWorkEvent(root, {
			...base,
			actor: null,
			detail: { y: '2', x: '1' },
		});
		const [first, second] = (
			await readFile(workEventJournalPath(root), 'utf8')
		)
			.trim()
			.split('\n')
			.map((text) => JSON.parse(text) as { payload_hash: string });
		expect(first?.payload_hash).toBe(second?.payload_hash);
	});

	it('keeps earlier lines when another is appended', async () => {
		await journalWorkEvent(root, {
			kind: 'slice_claimed',
			proposal: 'a',
			slice: 'b',
			actor: null,
		});
		await journalWorkEvent(root, {
			kind: 'slice_submitted',
			proposal: 'a',
			slice: 'b',
			actor: null,
		});
		const text = await readFile(workEventJournalPath(root), 'utf8');
		expect(text.trim().split('\n')).toHaveLength(2);
	});

	it('reports a failure to record instead of throwing', async () => {
		// A file where the cache directory should be makes every write fail.
		await writeFile(join(root, '.cache'), 'not a directory');
		const recorded = await journalWorkEvent(root, {
			kind: 'slice_claimed',
			proposal: 'a',
			slice: 'b',
			actor: null,
		});
		expect(recorded).toBe(false);
	});
});

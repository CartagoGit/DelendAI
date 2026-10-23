import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { EXIT_CODE } from '../../../../src/lib/contracts/constants/exit-code.constant';
import {
	journalEnteredUnit,
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

	it('records which instance of the agent it was, when it is known', async () => {
		for (const instance of ['a1b2c3d4', undefined])
			await journalWorkEvent(root, {
				kind: 'slice_claimed',
				proposal: 'q00020',
				slice: 'S1',
				actor: 'claude-sonnet-5-5',
				instance,
			});
		const [first, second] = (
			await readFile(workEventJournalPath(root), 'utf8')
		)
			.trim()
			.split('\n')
			.map((text) => JSON.parse(text) as Record<string, unknown>);
		expect(first?.instance_id).toBe('a1b2c3d4');
		expect(second).not.toHaveProperty('instance_id');
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

describe('journalEnteredUnit', () => {
	let root: string;

	beforeEach(async () => {
		root = await mkdtemp(join(tmpdir(), 'work-event-entered-'));
	});

	afterEach(async () => {
		await rm(root, { recursive: true, force: true });
	});

	const args = [
		'--proposal=q00020',
		'--slice=S1',
		'--agent=claude-sonnet-5-5',
	];

	it('journals the session the unit was entered under as its instance', async () => {
		await journalEnteredUnit(root, args, {
			code: EXIT_CODE.OK,
			data: { session: 'a1b2c3d4' },
		});
		await journalEnteredUnit(root, args, { code: EXIT_CODE.OK, data: {} });
		await journalEnteredUnit(root, args, { code: EXIT_CODE.OK });
		const lines = (await readFile(workEventJournalPath(root), 'utf8'))
			.trim()
			.split('\n')
			.map((text) => JSON.parse(text) as Record<string, unknown>);
		expect(lines.map((line) => line.instance_id)).toEqual([
			'a1b2c3d4',
			undefined,
			undefined,
		]);
		expect(lines[0]?.actor_id).toBe('claude-sonnet-5-5');
	});

	it('journals nothing for a refused entry', async () => {
		await journalEnteredUnit(root, args, {
			code: EXIT_CODE.USAGE,
			data: { session: 'a1b2c3d4' },
		});
		await expect(
			readFile(workEventJournalPath(root), 'utf8'),
		).rejects.toThrow();
	});
});

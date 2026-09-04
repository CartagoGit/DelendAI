import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
	createCompletionStore,
	recordFileName,
	recordPath,
	type ICompletionRecord,
} from '@delendai/completion/public';

const record = (
	overrides: Partial<ICompletionRecord> = {},
): ICompletionRecord => ({
	taskId: 't1',
	agent: 'falcon',
	summary: 'done',
	reviewEvidence: 'tests green',
	ts: '2026-08-24T00:00:00.000Z',
	...overrides,
});

describe('completion store', () => {
	let dir = '';
	beforeEach(() => {
		dir = mkdtempSync(join(tmpdir(), 'completion-'));
	});
	afterEach(() => rmSync(dir, { recursive: true, force: true }));

	it('recordFileName sanitises unsafe characters', () => {
		expect(recordFileName('a/b:c')).toMatch(/^a-b-c-[a-f0-9]{12}\.json$/);
		expect(recordFileName('///')).toMatch(/^task-[a-f0-9]{12}\.json$/);
	});

	it('recordFileName keeps sanitised task ids distinct', () => {
		expect(recordFileName('a/b')).not.toBe(recordFileName('a-b'));
		expect(recordFileName('a/b')).toBe(recordFileName('a/b'));
	});

	it('recordPath joins the records dir and the safe file name', () => {
		expect(recordPath('/tmp/records', 'a/b')).toBe(
			join('/tmp/records', recordFileName('a/b')),
		);
	});

	it('upsert writes a durable JSON record and list returns it newest-first', async () => {
		const store = createCompletionStore(dir);
		await store.upsert(
			record({ taskId: 't1', ts: '2026-08-24T01:00:00.000Z' }),
		);
		await store.upsert(
			record({ taskId: 't2', ts: '2026-08-24T02:00:00.000Z' }),
		);

		const listed = await store.list();
		expect(listed.map((r) => r.taskId)).toEqual(['t2', 't1']);
		expect(JSON.parse(readFileSync(recordPath(dir, 't1'), 'utf8'))).toEqual(
			record({ taskId: 't1', ts: '2026-08-24T01:00:00.000Z' }),
		);
	});

	it('upsert overwrites an existing record for the same taskId', async () => {
		const store = createCompletionStore(dir);
		await store.upsert(record({ summary: 'first' }));
		await store.upsert(record({ summary: 'second' }));
		expect((await store.list()).map((r) => r.summary)).toEqual(['second']);
	});

	it('round-trips colliding sanitised task ids independently', async () => {
		const store = createCompletionStore(dir);
		await store.upsert(record({ taskId: 'a/b', summary: 'slash' }));
		await store.upsert(record({ taskId: 'a-b', summary: 'dash' }));

		expect((await store.list()).map((r) => r.taskId).sort()).toEqual([
			'a-b',
			'a/b',
		]);
		expect(
			(await store.list({ taskId: 'a/b' })).map((r) => r.summary),
		).toEqual(['slash']);
		expect(await store.remove('a/b')).toBe(true);
		expect((await store.list()).map((r) => r.taskId)).toEqual(['a-b']);
	});

	it('removes matching legacy records without deleting a colliding task', async () => {
		const store = createCompletionStore(dir);
		writeFileSync(
			join(dir, 'a-b.json'),
			JSON.stringify(record({ taskId: 'a/b' })),
		);

		expect(await store.remove('a-b')).toBe(false);
		expect(await store.remove('a/b')).toBe(true);
		expect(await store.list()).toEqual([]);
	});

	it('list filters by taskId and agent', async () => {
		const store = createCompletionStore(dir);
		await store.upsert(record({ taskId: 'a', agent: 'falcon' }));
		await store.upsert(record({ taskId: 'b', agent: 'owl' }));
		expect(
			(await store.list({ agent: 'falcon' })).map((r) => r.taskId),
		).toEqual(['a']);
		expect((await store.list({ taskId: 'b' })).map((r) => r.agent)).toEqual(
			['owl'],
		);
		expect(await store.list({ taskId: 'missing' })).toEqual([]);
	});

	it('list returns [] on a missing dir and skips corrupt files', async () => {
		const store = createCompletionStore(join(dir, 'nope'));
		expect(await store.list()).toEqual([]);

		writeFileSync(recordPath(dir, 'corrupt'), '{{{ not json');
		writeFileSync(
			recordPath(dir, 'partial'),
			JSON.stringify({ taskId: 1 }),
		);
		expect(await store.list()).toEqual([]);
	});

	it('remove deletes the record and is a no-op for unknown ids', async () => {
		const store = createCompletionStore(dir);
		await store.upsert(record({ taskId: 't1' }));
		expect(await store.remove('t1')).toBe(true);
		expect(await store.list()).toEqual([]);
		expect(await store.remove('missing')).toBe(false);
	});
});

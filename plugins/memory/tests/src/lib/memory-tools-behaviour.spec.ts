/**
 * memory-tools-behaviour.spec.ts — the note-store tools through their
 * registered handlers: every limit `save` enforces, list paging, forget,
 * export and import, and where the tools declare their writes land.
 */
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { createFakeToolServer } from '@delendai/test-kit/public';

import { buildMemoryToolRegistrations } from '../../../src/lib/tools/tools';

const roots: string[] = [];
afterEach(() => {
	for (const root of roots.splice(0))
		rmSync(root, { recursive: true, force: true });
});

interface IResult {
	readonly isError?: boolean;
	readonly structuredContent?: Record<string, unknown>;
}

const store = async (maxNotes = 1000) => {
	const root = mkdtempSync(join(tmpdir(), 'memory-tools-'));
	roots.push(root);
	const registrations = buildMemoryToolRegistrations({
		namespacePrefix: 'memory',
		storePathAbs: join(root, 'notes.json'),
		bm25K1: 1.5,
		bm25B: 0.75,
		titleWeight: 2,
		maxNotes,
	});
	const handlers = new Map<string, (args: unknown) => Promise<IResult>>();
	for (const registration of registrations) {
		await registration.register(
			createFakeToolServer({
				onRegisterTool: (tool) => {
					handlers.set(
						tool.name.replace(/^memory_/u, ''),
						async (args) => (await tool.handler(args)) as IResult,
					);
				},
			}),
		);
	}
	const call = (tool: string, args: Record<string, unknown>) => {
		const handler = handlers.get(tool);
		if (handler === undefined) throw new Error(`no tool ${tool}`);
		return handler(args);
	};
	return { registrations, call };
};

describe('memory_save refuses what it cannot keep', () => {
	it.each([
		[
			'a title that is too long',
			{ title: 'x'.repeat(500), body: 'b' },
			'title too long',
		],
		[
			'a body that is too long',
			{ title: 't', body: 'x'.repeat(300_000) },
			'body too long',
		],
		[
			'too many tags',
			{
				title: 't',
				body: 'b',
				tags: Array.from({ length: 50 }, (_u, i) => `t${String(i)}`),
			},
			'too many tags',
		],
		[
			'a tag that is too long',
			{ title: 't', body: 'b', tags: ['x'.repeat(200)] },
			'tag too long',
		],
		[
			'a lifetime over a year',
			{ title: 't', body: 'b', ttlSeconds: 40_000_000 },
			'ttlSeconds too large',
		],
	])('%s', async (_name, args, message) => {
		const { call } = await store();
		const result = await call('save', args);
		expect(result.isError).toBe(true);
		expect(JSON.stringify(result)).toContain(message);
	});

	it('refuses a new note once the store is full, and says what to do', async () => {
		const { call } = await store(1);
		await call('save', { title: 'first', body: 'one' });
		const result = await call('save', { title: 'second', body: 'two' });
		expect(result.isError).toBe(true);
		expect(JSON.stringify(result)).toContain('memory_forget');
	});
});

describe('the rest of the store', () => {
	it('pages a list and says where the next page starts', async () => {
		const { call } = await store();
		for (const n of [1, 2, 3]) {
			await call('save', { title: `note ${String(n)}`, body: 'b' });
		}
		const first = await call('list', { limit: 2 });
		expect(first.structuredContent).toMatchObject({
			total: 3,
			nextOffset: 2,
		});
		const last = await call('list', { limit: 2, offset: 2 });
		expect(last.structuredContent?.nextOffset).toBeUndefined();
	});

	it('forgets a note by id, and says when there is none', async () => {
		const { call } = await store();
		const saved = await call('save', { title: 'gone', body: 'b' });
		const note = saved.structuredContent?.saved as
			| { id: string }
			| undefined;
		if (note === undefined) throw new Error('save returned no note');
		const id = note.id;
		expect((await call('forget', { id })).isError).toBeFalsy();
		const again = await call('forget', { id });
		expect(again.isError).toBe(true);
		expect(JSON.stringify(again)).toContain('memory_list');
	});

	it('exports as JSON or NDJSON and imports it back into another store', async () => {
		const source = await store();
		await source.call('save', { title: 'kept', body: 'b', tags: ['x'] });
		const json = await source.call('export', {});
		expect(json.structuredContent).toMatchObject({
			format: 'json',
			count: 1,
		});
		const ndjson = await source.call('export', { format: 'ndjson' });
		expect(ndjson.structuredContent?.format).toBe('ndjson');

		const target = await store();
		const imported = await target.call('import', {
			payload: json.structuredContent?.payload,
			mode: 'replace',
		});
		expect(imported.structuredContent).toMatchObject({ imported: 1 });
		const merged = await target.call('import', {
			payload: ndjson.structuredContent?.payload,
			format: 'ndjson',
			conflict: 'skip',
		});
		expect(merged.structuredContent).toMatchObject({ skipped: 1 });
	});

	it('refuses an import payload that is too large or not an export', async () => {
		const { call } = await store();
		const large = await call('import', { payload: 'x'.repeat(5_000_001) });
		expect(JSON.stringify(large)).toContain('payload too large');
		const invalid = await call('import', { payload: 'not json' });
		expect(invalid.isError).toBe(true);
		expect(JSON.stringify(invalid)).toContain('invalid import payload');
	});
});

describe('where the memory tools write', () => {
	it('keeps every note-store write in host state', async () => {
		const { registrations } = await store();
		const byId = new Map(registrations.map((r) => [r.id, r.writeRoot]));
		for (const id of ['save', 'forget', 'import']) {
			expect(byId.get(id)).toBe('host-state');
		}
	});
});

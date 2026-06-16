import {
	existsSync,
	mkdtempSync,
	readdirSync,
	readFileSync,
	rmSync,
	writeFileSync,
} from 'node:fs';
import { basename, join } from 'node:path';
import { tmpdir } from 'node:os';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
	readStore,
	recall,
	removeNote,
	saveNote,
} from '@cartago-git/mcp-memory/lib/store';
import plugin from '@cartago-git/mcp-memory';
import { buildMemoryToolRegistrations } from '@cartago-git/mcp-memory/lib/tools';
import { CorruptFileError } from '@cartago-git/mcp-core/public';
import type {
	IMcpPluginContext,
	IToolRegistration,
} from '@cartago-git/mcp-core/public';

const captureHandler = async (
	reg: IToolRegistration
): Promise<(a: unknown) => Promise<{ content: Array<{ text: string }> }>> => {
	let handler: (a: unknown) => Promise<{ content: Array<{ text: string }> }>;
	await reg.register({
		registerTool: (_n: string, _d: unknown, h: typeof handler) => {
			handler = h;
		},
	} as never);
	return handler!;
};

describe('memory store', () => {
	let dir = '';
	let store = '';
	beforeEach(() => {
		dir = mkdtempSync(join(tmpdir(), 'mem-'));
		store = join(dir, 'notes.json');
	});
	afterEach(() => rmSync(dir, { recursive: true, force: true }));

	it('upserts by title and recalls by query/tags', async () => {
		await saveNote(store, { title: 'DB choice', body: 'we use mysql', tags: ['db'] });
		await saveNote(store, { title: 'DB choice', body: 'we use mysql2', tags: ['db'] });
		expect(readStore(store)).toHaveLength(1); // upsert, not duplicate
		expect(recall(store, { query: 'mysql2' })[0]?.title).toBe('DB choice');
		expect(recall(store, { tags: ['db'] })).toHaveLength(1);
		expect(recall(store, { tags: ['missing'] })).toHaveLength(0);
	});

	it('forgets by id', async () => {
		const note = await saveNote(store, { title: 'Temp', body: 'x' });
		expect(await removeNote(store, note.id)).toBe(true);
		expect(readStore(store)).toHaveLength(0);
	});

	it('keeps every note when saved concurrently (mutex, no lost update)', async () => {
		await Promise.all(
			['Alpha', 'Bravo', 'Charlie', 'Delta', 'Echo'].map((title) =>
				saveNote(store, { title, body: title })
			)
		);
		expect(readStore(store)).toHaveLength(5);
	});

	it('treats missing/empty store as empty, not corrupt', () => {
		expect(readStore(store)).toEqual([]);
		writeFileSync(store, '   \n');
		expect(readStore(store)).toEqual([]);
	});
});

describe('memory store — corrupt ≠ empty (M10)', () => {
	let dir = '';
	let store = '';
	beforeEach(() => {
		dir = mkdtempSync(join(tmpdir(), 'mem-corrupt-'));
		store = join(dir, 'notes.json');
	});
	afterEach(() => rmSync(dir, { recursive: true, force: true }));

	const backupOf = (): string | undefined =>
		readdirSync(dir).find(
			(f) => f.startsWith(`${basename(store)}.corrupt-`)
		);

	it('preserves invalid JSON to a .corrupt backup and throws', () => {
		writeFileSync(store, '{ this is not json');
		expect(() => readStore(store)).toThrow(CorruptFileError);
		// original bytes preserved under a backup, original gone
		expect(existsSync(store)).toBe(false);
		const backup = backupOf();
		expect(backup).toBeDefined();
		expect(readFileSync(join(dir, backup!), 'utf8')).toBe(
			'{ this is not json'
		);
	});

	it('rejects valid JSON with the wrong shape', () => {
		writeFileSync(store, JSON.stringify({ wrong: true }));
		expect(() => readStore(store)).toThrow(CorruptFileError);
		expect(backupOf()).toBeDefined();
	});

	it('CorruptFileError carries the backup path', () => {
		writeFileSync(store, 'not json');
		try {
			readStore(store);
			expect.unreachable('should have thrown');
		} catch (err) {
			expect(err).toBeInstanceOf(CorruptFileError);
			const e = err as CorruptFileError;
			expect(e.backupPath).toContain('.corrupt-');
			expect(existsSync(e.backupPath!)).toBe(true);
		}
	});

	it('saveNote refuses to overwrite a corrupt store (no data loss)', async () => {
		writeFileSync(store, '{{{');
		await expect(
			saveNote(store, { title: 'X', body: 'y' })
		).rejects.toThrow(CorruptFileError);
	});

	it('recovers after the corrupt backup is moved aside', async () => {
		writeFileSync(store, 'broken');
		expect(() => readStore(store)).toThrow(CorruptFileError);
		// the original path is now free; a fresh save works
		const note = await saveNote(store, { title: 'Fresh', body: 'ok' });
		expect(readStore(store)).toHaveLength(1);
		expect(note.title).toBe('Fresh');
	});

	it('memory tools return a structured error naming the backup', async () => {
		const regs = buildMemoryToolRegistrations({
			namespacePrefix: 'memory',
			storePathAbs: store,
		});
		const byId = (id: string): IToolRegistration =>
			regs.find((r) => r.id === id)!;

		const cases: Array<[string, unknown]> = [
			['recall', {}],
			['list', {}],
			['save', { title: 'X', body: 'y' }],
			['forget', { id: 'x' }],
		];

		for (const [id, args] of cases) {
			// each handler quarantines the corrupt file, so re-seed it per case
			writeFileSync(store, '{ broken');
			const handler = await captureHandler(byId(id));
			const res = await handler(args);
			const body = JSON.parse(res.content[0]?.text ?? '{}') as {
				ok: boolean;
				error?: { reason: string; nextAction?: string };
			};
			expect(res, id).toMatchObject({ isError: true });
			expect(body.ok, id).toBe(false);
			expect(body.error?.reason, id).toContain('corrupt');
			expect(body.error?.nextAction, id).toContain('.corrupt-');
		}
	});
});

describe('memory plugin', () => {
	it('registers the four memory tools + knowledge', async () => {
		const ctx = {
			workspace: { root: '/ws', resolve: (p: string) => `/ws/${p}` },
			corePaths: { cacheDir: '.cache/mcp-core', docsDir: 'docs/mcp-core' },
			cacheDir: '.cache/mcp-core',
			docsDir: 'docs/mcp-core',
			pluginCacheDir: '.cache/mcp-core/memory',
			pluginDocsDir: 'docs/mcp-core/memory',
			namespacePrefix: 'memory',
			options: {},
			args: {},
		} satisfies IMcpPluginContext;
		const reg = await plugin.register(ctx);
		expect(reg.tools?.map((t) => t.id)).toEqual([
			'save',
			'recall',
			'list',
			'forget',
		]);
		// The registered MCP names are single-prefixed (`memory_save`, …),
		// not double-prefixed (`memory_memory_save`). [e2e regression guard]
		expect(reg.knowledge?.[0]?.id).toBe('memory-usage');
	});
});

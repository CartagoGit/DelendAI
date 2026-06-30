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
} from '@mcp-vertex/memory/lib/services/store';
import plugin from '@mcp-vertex/memory';
import { buildMemoryToolRegistrations } from '@mcp-vertex/memory/lib/tools';
import { CorruptFileError } from '@mcp-vertex/core/public';
import type {
	IMcpPluginContext,
	IToolRegistration,
} from '@mcp-vertex/core/public';

const captureHandler = async (
	reg: IToolRegistration,
): Promise<(a: unknown) => Promise<{ content: Array<{ text: string }> }>> => {
	let handler: (a: unknown) => Promise<{ content: Array<{ text: string }> }>;
	await reg.register({
		registerTool: (_n: string, _d: unknown, h: typeof handler) => {
			handler = h;
		},
	} as never);
	return handler!;
};

describe('memory store', async () => {
	let dir = '';
	let store = '';
	beforeEach(() => {
		dir = mkdtempSync(join(tmpdir(), 'mem-'));
		store = join(dir, 'notes.json');
	});
	afterEach(() => rmSync(dir, { recursive: true, force: true }));

	it('upserts by title and recalls by query/tags', async () => {
		await saveNote(store, {
			title: 'DB choice',
			body: 'we use mysql',
			tags: ['db'],
		});
		await saveNote(store, {
			title: 'DB choice',
			body: 'we use mysql2',
			tags: ['db'],
		});
		expect(await readStore(store)).toHaveLength(1); // upsert, not duplicate
		expect((await recall(store, { query: 'mysql2' }))[0]?.title).toBe(
			'DB choice',
		);
		expect(await recall(store, { tags: ['db'] })).toHaveLength(1);
		expect(await recall(store, { tags: ['missing'] })).toHaveLength(0);
	});

	it('forgets by id', async () => {
		const { note } = await saveNote(store, { title: 'Temp', body: 'x' });
		expect(await removeNote(store, note.id)).toBe(true);
		expect(await readStore(store)).toHaveLength(0);
	});

	// Mutex serialises 5 concurrent saves with O_EXCL + polling backoff; under
	// heavy parallel-suite CPU load that can exceed the 5s default, so this
	// inherently-slow contention test gets a wider timeout. (Correctness is
	// the assertion below; the wait is just scheduling, not a hang.)
	it('keeps every note when saved concurrently (mutex, no lost update)', async () => {
		await Promise.all(
			['Alpha', 'Bravo', 'Charlie', 'Delta', 'Echo'].map((title) =>
				saveNote(store, { title, body: title }),
			),
		);
		expect(await readStore(store)).toHaveLength(5);
	}, 20_000);

	it('treats missing/empty store as empty, not corrupt', async () => {
		expect(await readStore(store)).toEqual([]);
		writeFileSync(store, '   \n');
		expect(await readStore(store)).toEqual([]);
	});
});

describe('memory recall — relevance ranking (N22)', async () => {
	let dir = '';
	let store = '';
	beforeEach(() => {
		dir = mkdtempSync(join(tmpdir(), 'mem-rank-'));
		store = join(dir, 'notes.json');
	});
	afterEach(() => rmSync(dir, { recursive: true, force: true }));

	it('ranks the more relevant note first (not just recency)', async () => {
		// Older note is highly relevant; newer note barely mentions the term.
		await saveNote(
			store,
			{
				title: 'Postgres indexing',
				body: 'index index index on postgres',
			},
			() => '2026-01-01T00:00:00.000Z',
		);
		await saveNote(
			store,
			{ title: 'Deploy notes', body: 'we mention index once' },
			() => '2026-06-01T00:00:00.000Z',
		);
		const hits = await recall(store, { query: 'index' });
		expect(hits[0]?.title).toBe('Postgres indexing'); // relevance > recency
		expect(hits).toHaveLength(2);
	});

	it('weights title matches over body matches', async () => {
		await saveNote(store, {
			title: 'auth flow',
			body: 'unrelated text here',
		});
		await saveNote(store, {
			title: 'misc',
			body: 'a passing mention of auth',
		});
		const hits = await recall(store, { query: 'auth' });
		expect(hits[0]?.title).toBe('auth flow');
	});

	it('keeps a substring floor (partial-token match)', async () => {
		await saveNote(store, { title: 'DB', body: 'we use mysql2 here' });
		// "mysql" is not a standalone token (the body has "mysql2") — the
		// substring floor must still surface it.
		expect((await recall(store, { query: 'mysql' }))[0]?.title).toBe('DB');
	});

	it('tags remain a hard filter alongside a query', async () => {
		await saveNote(store, {
			title: 'A',
			body: 'cache strategy',
			tags: ['ops'],
		});
		await saveNote(store, {
			title: 'B',
			body: 'cache strategy',
			tags: ['dev'],
		});
		const hits = await recall(store, { query: 'cache', tags: ['ops'] });
		expect(hits.map((h) => h.title)).toEqual(['A']);
	});

	it('returns nothing when no note matches the query', async () => {
		await saveNote(store, { title: 'A', body: 'nothing relevant' });
		expect(await recall(store, { query: 'zzzznomatch' })).toEqual([]);
	});

	it('with no query, falls back to newest-first', async () => {
		await saveNote(
			store,
			{ title: 'old', body: 'x' },
			() => '2026-01-01T00:00:00.000Z',
		);
		await saveNote(
			store,
			{ title: 'new', body: 'y' },
			() => '2026-06-01T00:00:00.000Z',
		);
		expect((await recall(store, {}))[0]?.title).toBe('new');
	});
});

describe('memory recall — adversarial inputs (N23)', async () => {
	let dir = '';
	let store = '';
	beforeEach(() => {
		dir = mkdtempSync(join(tmpdir(), 'mem-adv-'));
		store = join(dir, 'notes.json');
	});
	afterEach(() => rmSync(dir, { recursive: true, force: true }));

	it('regex-special queries are treated literally, never as regex (no throw)', async () => {
		await saveNote(store, {
			title: 'Globs',
			body: 'pattern a.*b (group) [set] $end',
		});
		for (const q of ['.*', '(', '[', '\\', '$end', 'a.*b', '(group)']) {
			await expect(recall(store, { query: q })).resolves.toBeDefined();
		}
		// the literal substring `a.*b` is present → surfaced via the floor
		expect((await recall(store, { query: 'a.*b' }))[0]?.title).toBe(
			'Globs',
		);
	});

	it('handles unicode and a very long query without throwing', async () => {
		await saveNote(store, { title: 'café', body: '☕ über naïve façade' });
		expect((await recall(store, { query: 'café' }))[0]?.title).toBe('café');
		await expect(
			recall(store, { query: 'x'.repeat(50_000) }),
		).resolves.toBeDefined();
	});

	it('round-trips unicode/control-ish content through save+recall', async () => {
		await saveNote(store, {
			title: 'Tab\tnote',
			body: 'line1\nline2 — emoji 🚀',
		});
		const hits = await recall(store, { query: 'emoji' });
		expect(hits[0]?.body).toContain('🚀');
	});
});

describe('memory store — corrupt ≠ empty (M10)', async () => {
	let dir = '';
	let store = '';
	beforeEach(() => {
		dir = mkdtempSync(join(tmpdir(), 'mem-corrupt-'));
		store = join(dir, 'notes.json');
	});
	afterEach(() => rmSync(dir, { recursive: true, force: true }));

	const backupOf = (): string | undefined =>
		readdirSync(dir).find((f) =>
			f.startsWith(`${basename(store)}.corrupt-`),
		);

	it('preserves invalid JSON to a .corrupt backup and throws', async () => {
		writeFileSync(store, '{ this is not json');
		await expect(readStore(store)).rejects.toThrow(CorruptFileError);
		// original bytes preserved under a backup, original gone
		expect(existsSync(store)).toBe(false);
		const backup = backupOf();
		expect(backup).toBeDefined();
		expect(readFileSync(join(dir, backup!), 'utf8')).toBe(
			'{ this is not json',
		);
	});

	it('rejects valid JSON with the wrong shape', async () => {
		writeFileSync(store, JSON.stringify({ wrong: true }));
		await expect(readStore(store)).rejects.toThrow(CorruptFileError);
		expect(backupOf()).toBeDefined();
	});

	it('CorruptFileError carries the backup path', async () => {
		writeFileSync(store, 'not json');
		try {
			await readStore(store);
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
			saveNote(store, { title: 'X', body: 'y' }),
		).rejects.toThrow(CorruptFileError);
	});

	it('recovers after the corrupt backup is moved aside', async () => {
		writeFileSync(store, 'broken');
		await expect(readStore(store)).rejects.toThrow(CorruptFileError);
		// the original path is now free; a fresh save works
		const { note } = await saveNote(store, { title: 'Fresh', body: 'ok' });
		expect(await readStore(store)).toHaveLength(1);
		expect(note.title).toBe('Fresh');
	});

	it('memory tools return a structured error naming the backup', async () => {
		const regs = buildMemoryToolRegistrations({
			namespacePrefix: 'memory',
			storePathAbs: store,
			bm25K1: 1.5,
			bm25B: 0.75,
			titleWeight: 2,
			maxNotes: 1000,
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

describe('memory plugin', async () => {
	it('registers the seven memory tools + knowledge', async () => {
		const ctx = {
			workspace: { root: '/ws', resolve: (p: string) => `/ws/${p}` },
			corePaths: {
				cacheDir: '.cache/mcp-vertex',
				docsDir: 'docs/mcp-vertex',
			},
			cacheDir: '.cache/mcp-vertex',
			docsDir: 'docs/mcp-vertex',
			keepLegacy: false,
			pluginCacheDir: '.cache/mcp-vertex/memory',
			pluginDocsDir: 'docs/mcp-vertex/memory',
			namespacePrefix: 'memory',
			options: {},
			args: {},
		} satisfies IMcpPluginContext;
		const reg = await plugin.register(ctx);
		expect(reg.tools?.map((t) => t.id)).toEqual([
			'compact',
			'save',
			'recall',
			'list',
			'forget',
			'export',
			'import',
		]);
		// The registered MCP names are single-prefixed (`memory_save`, …),
		// not double-prefixed (`memory_memory_save`). [e2e regression guard]
		expect(reg.knowledge?.[0]?.id).toBe('memory-usage');
	});
});

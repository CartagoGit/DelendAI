import { Database } from 'bun:sqlite';
import { existsSync, mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
	InMemoryTimelineStore,
	whenAdded,
	type IRoadmapTimelineDraft,
} from '@delendai/roadmap/public';

import {
	CREATE_EVENTS_TABLE_V1_SQL,
	ROADMAP_SQLITE_SCHEMA_VERSION,
	ROADMAP_TIMELINE_DB_FILENAME,
} from '../../../src/lib/contracts/constants/roadmap-sqlite.constant';
import {
	migrateRoadmapDatabase,
	readUserVersion,
} from '../../../src/lib/migrations.service';
import {
	resolveTimelineDatabasePath,
	SqliteTimelineStore,
} from '../../../src/lib/sqlite-timeline.store';

const META = {
	actor: 'maintainer',
	at: '2026-10-07T10:00:00.000Z',
	reason: 'planning the next minor',
} as const;

const added = (id: string, horizon = '0.5.0'): IRoadmapTimelineDraft => ({
	...META,
	kind: 'entry-added',
	horizon,
	entryId: id,
	entry: {
		id,
		title: `Entry ${id}`,
		kind: 'feature',
		state: 'proposed',
		gates: [],
	},
});

describe('SqliteTimelineStore', () => {
	let cacheDir = '';
	let store: SqliteTimelineStore;

	beforeEach(() => {
		cacheDir = mkdtempSync(join(tmpdir(), 'roadmap-sqlite-'));
		store = new SqliteTimelineStore({ pluginCacheDir: cacheDir });
	});

	afterEach(() => {
		store.close();
		rmSync(cacheDir, { recursive: true, force: true });
	});

	it('lists nothing before anything was appended', async () => {
		expect(await store.list()).toEqual({ ok: true, value: [] });
	});

	it('keeps its database inside the plugin cache directory and nowhere else', async () => {
		await store.append([added('a')]);
		expect(resolveTimelineDatabasePath(cacheDir)).toBe(
			join(cacheDir, ROADMAP_TIMELINE_DB_FILENAME),
		);
		expect(existsSync(join(cacheDir, ROADMAP_TIMELINE_DB_FILENAME))).toBe(
			true,
		);
		expect(
			readdirSync(cacheDir).every((name) => !name.startsWith('.')),
		).toBe(true);
	});

	it('answers the same as the in-memory timeline for the same history', async () => {
		const drafts = [
			added('a'),
			added('b'),
			{
				...META,
				kind: 'entry-state-changed' as const,
				horizon: '0.5.0',
				entryId: 'a',
				from: 'proposed' as const,
				to: 'committed' as const,
			},
			added('c', '0.6.0'),
		];
		const memory = new InMemoryTimelineStore();
		await memory.append(drafts.slice(0, 2));
		await memory.append(drafts.slice(2));
		await store.append(drafts.slice(0, 2));
		await store.append(drafts.slice(2));
		expect(await store.list()).toEqual(await memory.list());
		expect(await store.list({ entryId: 'a' })).toEqual(
			await memory.list({ entryId: 'a' }),
		);
		expect(await store.list({ horizon: '0.6.0' })).toEqual(
			await memory.list({ horizon: '0.6.0' }),
		);
	});

	it('answers when an entry was added, who added it and why', async () => {
		await store.append([
			{ ...added('a'), actor: 'ana', reason: 'asked by support' },
		]);
		const listed = await store.list();
		const found = listed.ok ? whenAdded(listed.value, 'a') : undefined;
		expect(found?.actor).toBe('ana');
		expect(found?.reason).toBe('asked by support');
	});

	it('keeps the history across a reopen and carries on the numbering', async () => {
		await store.append([added('a')]);
		store.close();
		const reopened = new SqliteTimelineStore({ pluginCacheDir: cacheDir });
		const result = await reopened.append([added('b')]);
		reopened.close();
		expect(result.ok && result.value[0]?.seq).toBe(2);
	});

	it('appends a batch whole or not at all', async () => {
		const result = await store.append([
			added('a'),
			{ ...added('b'), reason: '' },
		]);
		expect(result.ok).toBe(false);
		expect(await store.list()).toEqual({ ok: true, value: [] });
	});

	it('redacts a secret in the reason', async () => {
		const secret = `ghp_${'a1B2c3D4e5F6g7H8i9J0k1L2m3N4o5P6q7R8'}`;
		await store.append([{ ...added('a'), reason: `rotated ${secret}` }]);
		const listed = await store.list();
		expect(listed.ok && listed.value[0]?.reason).not.toContain(secret);
	});

	it('refuses to update or delete an event, even from outside the driver', async () => {
		await store.append([added('a')]);
		const raw = new Database(resolveTimelineDatabasePath(cacheDir));
		expect(() =>
			raw.run("UPDATE timeline_events SET reason = 'x'"),
		).toThrow('append-only');
		expect(() => raw.run('DELETE FROM timeline_events')).toThrow(
			'append-only',
		);
		raw.close();
	});

	it('reports an unreadable database as a result, not an exception', async () => {
		const { writeFileSync } = await import('node:fs');
		writeFileSync(
			join(cacheDir, ROADMAP_TIMELINE_DB_FILENAME),
			'not a database at all',
		);
		const result = await store.list();
		expect(result.ok).toBe(false);
	});
});

describe('roadmap timeline migrations', () => {
	let dir = '';

	beforeEach(() => {
		dir = mkdtempSync(join(tmpdir(), 'roadmap-sqlite-migrate-'));
	});

	afterEach(() => {
		rmSync(dir, { recursive: true, force: true });
	});

	const eventJson = (seq: number, entryId: string): string =>
		JSON.stringify({ ...added(entryId), seq });

	it('creates a fresh database at the current version', () => {
		const db = new Database(join(dir, 'fresh.sqlite'));
		migrateRoadmapDatabase(db);
		expect(readUserVersion(db)).toBe(ROADMAP_SQLITE_SCHEMA_VERSION);
		db.close();
	});

	it('is idempotent: running twice changes nothing', () => {
		const db = new Database(join(dir, 'twice.sqlite'));
		migrateRoadmapDatabase(db);
		db.run(
			"INSERT INTO timeline_events (seq, at, actor, kind, horizon, entry_id, reason, event_json) VALUES (1, 'a', 'b', 'entry-added', '0.5.0', 'x', 'r', '{}')",
		);
		migrateRoadmapDatabase(db);
		const count = db
			.query('SELECT COUNT(*) AS n FROM timeline_events')
			.get() as {
			n: number;
		};
		expect(count.n).toBe(1);
		expect(readUserVersion(db)).toBe(ROADMAP_SQLITE_SCHEMA_VERSION);
		db.close();
	});

	it('upgrades a version 1 database and keeps what it held', async () => {
		const path = join(dir, ROADMAP_TIMELINE_DB_FILENAME);
		const old = new Database(path);
		old.run(CREATE_EVENTS_TABLE_V1_SQL);
		old.run('PRAGMA user_version = 1;');
		old.run(
			"INSERT INTO timeline_events (seq, at, actor, kind, reason, event_json) VALUES (1, ?, ?, 'entry-added', ?, ?)",
			[META.at, META.actor, META.reason, eventJson(1, 'old')],
		);
		old.close();

		const upgraded = new SqliteTimelineStore({ pluginCacheDir: dir });
		const byEntry = await upgraded.list({ entryId: 'old' });
		expect(byEntry.ok && byEntry.value.map((event) => event.seq)).toEqual([
			1,
		]);
		const next = await upgraded.append([added('new')]);
		expect(next.ok && next.value[0]?.seq).toBe(2);
		upgraded.close();

		const check = new Database(path);
		expect(readUserVersion(check)).toBe(ROADMAP_SQLITE_SCHEMA_VERSION);
		expect(() => check.run('DELETE FROM timeline_events')).toThrow(
			'append-only',
		);
		check.close();
	});

	it('refuses a database of a newer schema instead of writing to it', () => {
		const db = new Database(join(dir, 'future.sqlite'));
		db.run(`PRAGMA user_version = ${ROADMAP_SQLITE_SCHEMA_VERSION + 1};`);
		expect(() => migrateRoadmapDatabase(db)).toThrow('upgrade delendai');
		db.close();
	});
});

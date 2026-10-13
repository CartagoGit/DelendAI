import { mkdirSync, mkdtempSync, rmSync, chmodSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';
import { Database } from 'bun:sqlite';

import {
	STATE_ABI_VERSION,
	asWorktreeId,
	sha256BytesHex,
	type IHydrateInput,
	type IProjectionResult,
	type IStateChange,
	type IStateInputSnapshot,
	type IStateProducer,
	type IProducerContext,
	type StateScope,
} from '@delendai/state';

import { SqliteStateRegistry } from './sqlite-driver';
import { STATE_SQLITE_OLDEST_MIGRATABLE_SCHEMA_VERSION } from './contracts/constants/state-sqlite-migrations.constant';
import { STATE_SQLITE_SCHEMA_VERSION, SQLITE_BOOT_PRAGMAS } from './schema';

const scope: StateScope = {
	kind: 'project',
	locator: {
		workspaceRoot: '/repo',
		worktreeId: asWorktreeId('wt-A'),
		cacheRoot: '/repo/.cache/delendai',
		docsRoot: '/repo/docs/delendai',
	},
};

function tmpDbPath(): string {
	const dir = mkdtempSync(join(tmpdir(), 'state-sqlite-'));
	return join(dir, 'state.sqlite');
}

function makeProducer(): IStateProducer {
	return {
		id: 'kv',
		abiVersion: STATE_ABI_VERSION,
		producerVersion: 1,
		serves: ['project'],
		inputs: [{ kind: 'file', locator: 'kv.json' }],
		rebuild(ctx: IProducerContext): IProjectionResult {
			const raw = ctx.resolved[0]?.content ?? new Uint8Array();
			const text = new TextDecoder().decode(raw);
			const entries =
				text.length > 0
					? (JSON.parse(text) as Array<[string, number]>)
					: [];
			entries.sort(([a], [b]) => a.localeCompare(b));
			return { canonical: { entries } };
		},
		reconcile(
			ctx: IProducerContext,
			change: IStateChange,
		): IProjectionResult {
			const base = (ctx.baseProjection?.canonical ?? { entries: [] }) as {
				entries: Array<[string, number]>;
			};
			const map = new Map(base.entries);
			if (change.kind === 'set') {
				map.set(String(change.key), Number(change.value));
			}
			if (change.kind === 'delete') {
				map.delete(String(change.key));
			}
			const entries = Array.from(map.entries()).sort(([a], [b]) =>
				a.localeCompare(b),
			);
			return { canonical: { entries } };
		},
	};
}

function snapshot(entries: Array<[string, number]> = []): IStateInputSnapshot {
	const bytes = new TextEncoder().encode(JSON.stringify(entries));
	const digest = sha256BytesHex(bytes);
	return {
		fingerprint: {
			abiVersion: STATE_ABI_VERSION,
			producers: [
				{
					id: 'kv',
					producerVersion: 1,
					abiVersion: STATE_ABI_VERSION,
					inputs: [
						{
							kind: 'file',
							locator: 'kv.json',
							digest,
						},
					],
				},
			],
		},
		contents: new Map([['file|kv.json|', bytes]]),
		declared: [{ kind: 'file', locator: 'kv.json' }],
		byProducer: new Map([
			[
				'kv',
				[
					{
						spec: { kind: 'file', locator: 'kv.json' },
						digest,
						content: bytes,
					},
				],
			],
		]),
	};
}

function input(entries: Array<[string, number]> = []): IHydrateInput {
	return {
		scope,
		storageIdentity: { repositoryInstanceId: 'repo', worktreeId: 'wt-A' },
		snapshot: snapshot(entries),
	};
}

describe('SqliteStateRegistry', () => {
	it('keeps user_version out of boot pragmas and stamps it after bootstrap', () => {
		expect(
			SQLITE_BOOT_PRAGMAS.some((pragma) =>
				pragma.startsWith('PRAGMA user_version'),
			),
		).toBe(false);

		const registry = new SqliteStateRegistry({
			path: tmpDbPath(),
			clock: () => 0,
		});
		try {
			const row = (registry as unknown as { db: Database }).db
				.query('PRAGMA user_version;')
				.get() as Record<string, number> | null;
			expect(row?.user_version ?? row?.userVersion ?? 0).toBe(
				STATE_SQLITE_SCHEMA_VERSION,
			);
		} finally {
			registry.close();
		}
	});

	it('rejects a future user_version before bootstrap can overwrite it', () => {
		const path = tmpDbPath();
		const database = new Database(path);
		database.exec('PRAGMA user_version = 99;');
		database.close(false);

		let failure: unknown;
		try {
			new SqliteStateRegistry({ path, clock: () => 0 });
		} catch (error) {
			failure = error;
		}
		expect(failure).toMatchObject({
			pragma: '99',
			observedSchemaVersion: 99,
			supportedSchemaRange: {
				min: STATE_SQLITE_OLDEST_MIGRATABLE_SCHEMA_VERSION,
				max: STATE_SQLITE_SCHEMA_VERSION,
			},
		});

		const reopened = new Database(path);
		const row = reopened.query('PRAGMA user_version;').get() as Record<
			string,
			number
		> | null;
		expect(row?.user_version ?? row?.userVersion ?? 0).toBe(99);
		reopened.close(false);
	});

	it('round-trips hydrate -> lookup across registry instances', () => {
		const path = tmpDbPath();
		const producer = makeProducer();
		const writer = new SqliteStateRegistry({ path, clock: () => 10 });
		writer.defineProducer(producer);
		const hydrated = writer.hydrate(input([['a', 1]]));
		expect(hydrated.ok).toBe(true);
		writer.close();

		const reader = new SqliteStateRegistry({ path, clock: () => 20 });
		reader.defineProducer(producer);
		const read = reader.lookup({ scope, producerId: 'kv' });
		expect(read.ok).toBe(true);
		if (!read.ok) return;
		expect(read.projection).toEqual({ entries: [['a', 1]] });
		reader.close();
	});

	it('persists an incremental over unchanged inputs and keeps it across instances', () => {
		// The change arrives as an event, so the generation keeps its
		// predecessor's input fingerprint. Schema v1 keyed rows by that
		// fingerprint and this second write failed SQLITE_CONSTRAINT_UNIQUE.
		const path = tmpDbPath();
		const producer = makeProducer();
		const writer = new SqliteStateRegistry({ path, clock: () => 0 });
		writer.defineProducer(producer);
		const first = writer.hydrate(input());
		expect(first.ok).toBe(true);
		const second = writer.incremental(input(), {
			kind: 'set',
			key: 'a',
			value: 1,
		});
		expect(second).toMatchObject({ ok: true });
		if (!first.ok || !second.ok) return;
		const stale = writer.acquireProjectLease({
			scope,
			generationId: first.generation.id,
			token: first.generation.projectLeaseToken,
		});
		expect(stale).toMatchObject({
			ok: false,
			reason: 'STALE_PROJECT_GENERATION',
			currentGenerationId: second.generation.id,
		});
		writer.close();

		const reader = new SqliteStateRegistry({ path, clock: () => 1 });
		reader.defineProducer(producer);
		const read = reader.lookup({ scope, producerId: 'kv' });
		expect(read).toMatchObject({
			ok: true,
			projection: { entries: [['a', 1]] },
		});
		reader.close();
	});

	it('migrates a v1 store in place and then accepts incremental builds', () => {
		const path = tmpDbPath();
		const producer = makeProducer();
		const seeded = new SqliteStateRegistry({ path, clock: () => 0 });
		seeded.defineProducer(producer);
		expect(seeded.hydrate(input([['a', 1]])).ok).toBe(true);
		seeded.close();

		// Rewind the store to exactly what the v1 driver wrote.
		const legacy = new Database(path);
		legacy.exec(`
			CREATE TABLE generations_v1 (
				id INTEGER PRIMARY KEY AUTOINCREMENT,
				scope_kind TEXT NOT NULL,
				scope_locator_json TEXT NOT NULL,
				snapshot_json TEXT NOT NULL,
				fingerprint TEXT NOT NULL UNIQUE,
				reconciled_commit_sha TEXT,
				schema_version INTEGER NOT NULL,
				created_at INTEGER NOT NULL,
				updated_at INTEGER NOT NULL
			);
			INSERT INTO generations_v1 (id, scope_kind, scope_locator_json, snapshot_json, fingerprint, reconciled_commit_sha, schema_version, created_at, updated_at)
				SELECT id, scope_kind, scope_locator_json, snapshot_json, fingerprint, reconciled_commit_sha, 1, created_at, updated_at FROM generations;
			DROP TABLE generations;
			ALTER TABLE generations_v1 RENAME TO generations;
			PRAGMA user_version = 1;
		`);
		legacy.close(false);

		const migrated = new SqliteStateRegistry({ path, clock: () => 1 });
		try {
			migrated.defineProducer(producer);
			const inspector = new Database(path, { readonly: true });
			try {
				const version = inspector
					.query('PRAGMA user_version;')
					.get() as Record<string, number> | null;
				expect(version?.user_version ?? version?.userVersion).toBe(
					STATE_SQLITE_SCHEMA_VERSION,
				);
				expect(
					inspector
						.query('SELECT generation_id FROM generations;')
						.all(),
				).toHaveLength(1);
			} finally {
				inspector.close(false);
			}
			expect(migrated.lookup({ scope, producerId: 'kv' })).toMatchObject({
				ok: true,
				projection: { entries: [['a', 1]] },
			});
			expect(
				migrated.incremental(input([['a', 1]]), {
					kind: 'set',
					key: 'b',
					value: 2,
				}),
			).toMatchObject({ ok: true });
		} finally {
			migrated.close();
		}
	});

	it('incremental converges on the same active state', () => {
		const registry = new SqliteStateRegistry({
			path: tmpDbPath(),
			clock: () => 0,
		});
		registry.defineProducer(makeProducer());
		expect(registry.hydrate(input())).toMatchObject({ ok: true });
		const updated = registry.incremental(
			input([
				['a', 1],
				['b', 2],
			]),
			{
				kind: 'set',
				key: 'b',
				value: 2,
			},
		);
		expect(updated.ok).toBe(true);
		const read = registry.lookup({ scope, producerId: 'kv' });
		expect(read.ok).toBe(true);
		if (!read.ok) return;
		expect(read.projection).toEqual({ entries: [['b', 2]] });
		registry.close();
	});

	it('10 parallel rebuilds converge to one consistent active state', async () => {
		const registry = new SqliteStateRegistry({
			path: tmpDbPath(),
			clock: () => 100,
		});
		registry.defineProducer(makeProducer());
		const writes = Array.from({ length: 10 }, (_, index) =>
			Promise.resolve().then(() =>
				registry.hydrate(input([[`k${String(index)}`, index]])),
			),
		);
		const results = await Promise.all(writes);
		expect(results.every((result) => result.ok)).toBe(true);
		const read = registry.lookup({ scope, producerId: 'kv' });
		expect(read.ok).toBe(true);
		if (!read.ok) return;
		expect(
			Array.isArray((read.projection as { entries: unknown }).entries),
		).toBe(true);
		registry.close();
	});

	it('returns state_store_unavailable when the database path is not writable', () => {
		const root = mkdtempSync(join(tmpdir(), 'state-sqlite-ro-'));
		const dir = join(root, 'readonly');
		mkdirSync(dir);
		chmodSync(dir, 0o555);
		try {
			expect(
				() =>
					new SqliteStateRegistry({
						path: join(dir, 'state.sqlite'),
						clock: () => 0,
					}),
			).toThrow();
		} finally {
			chmodSync(dir, 0o755);
			rmSync(root, { recursive: true, force: true });
		}
	});

	it('returns state_store_corrupt when integrity failure is forced through the persisted snapshot', () => {
		const path = tmpDbPath();
		const registry = new SqliteStateRegistry({ path, clock: () => 0 });
		registry.defineProducer(makeProducer());
		const hydrated = registry.hydrate(input([['a', 1]]));
		expect(hydrated.ok).toBe(true);
		registry.forceIntegrityFailureForTests(scope);
		const failed = registry.incremental(input([['a', 2]]), {
			kind: 'set',
			key: 'a',
			value: 2,
		});
		expect(failed.ok).toBe(false);
		if (failed.ok) return;
		expect(failed.reason).toBe('state_store_corrupt');
		registry.close();
	});

	it('maps a corrupt persisted snapshot to state_store_corrupt', () => {
		const path = tmpDbPath();
		const writer = new SqliteStateRegistry({ path, clock: () => 0 });
		writer.defineProducer(makeProducer());
		expect(writer.hydrate(input([['a', 1]]))).toMatchObject({ ok: true });
		writer.close();

		const database = new Database(path);
		database.exec(
			"UPDATE generations SET snapshot_json = '{' WHERE id = 1;",
		);
		database.close(false);

		const reader = new SqliteStateRegistry({ path, clock: () => 1 });
		expect(() => reader.defineProducer(makeProducer())).not.toThrow();
		const failed = reader.hydrate(input([['a', 2]]));
		expect(failed).toMatchObject({
			ok: false,
			reason: 'state_store_corrupt',
			storeFailure: { pragma: 'snapshot_json_parse' },
		});
		reader.close();
	});
});

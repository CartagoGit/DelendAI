import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { asWorkItemId } from './work-event';
import { NdjsonWorkEventStore } from './work-event-store.ndjson';
import { SqliteWorkEventStore } from './work-event-store.sqlite';
import { WorkEventStoreFacade } from './work-event-store.facade';

const makeTmpDir = (): string =>
	mkdtempSync(join(tmpdir(), 'state-telemetry-store-'));

describe('SqliteWorkEventStore (f00509 S1)', () => {
	let dir: string;
	let store: SqliteWorkEventStore;

	beforeEach(() => {
		dir = makeTmpDir();
		store = new SqliteWorkEventStore({
			path: join(dir, 'work-events.sqlite'),
		});
	});

	afterEach(() => {
		store.close();
		rmSync(dir, { recursive: true, force: true });
	});

	it('creates the work_events table with the schema declared in q00020', () => {
		expect(store.count()).toBe(0);
		const event = store.append({
			work_item_id: asWorkItemId('f00509/S1'),
			actor_id: 'agent:test',
			kind: 'git_change',
			payload_hash: 'a'.repeat(64),
		});
		expect(event.id).toBe(1);
		expect(event.kind).toBe('git_change');
		expect(store.count()).toBe(1);
	});

	it('rejects events whose kind is not in the closed union', () => {
		expect(() =>
			store.append({
				work_item_id: asWorkItemId('f00509/S1'),
				actor_id: null,
				kind: 'not_a_kind' as never,
				payload_hash: 'x',
			}),
		).toThrow(/unknown work event kind/);
	});

	it('preserves insertion order within a single work_item_id', () => {
		const ids: number[] = [];
		for (const kind of [
			'git_change',
			'test_started',
			'test_finished',
		] as const) {
			const event = store.append({
				work_item_id: asWorkItemId('f00509/S1'),
				actor_id: null,
				kind,
				payload_hash: 'b'.repeat(64),
			});
			expect(event.id).toBeDefined();
			ids.push(event.id ?? -1);
		}
		const events = store.listByWorkItem(asWorkItemId('f00509/S1'));
		expect(events.map((event) => event.kind)).toEqual([
			'git_change',
			'test_started',
			'test_finished',
		]);
		expect(events.map((event) => event.id)).toEqual(ids);
	});

	it('keeps the autoincrement id monotonic across closes', () => {
		store.append({
			work_item_id: asWorkItemId('f00509/S1'),
			actor_id: null,
			kind: 'git_change',
			payload_hash: 'c'.repeat(64),
		});
		store.close();
		const reopened = new SqliteWorkEventStore({
			path: join(dir, 'work-events.sqlite'),
		});
		const second = reopened.append({
			work_item_id: asWorkItemId('f00509/S2'),
			actor_id: null,
			kind: 'git_change',
			payload_hash: 'd'.repeat(64),
		});
		expect(second.id).toBe(2);
		reopened.close();
	});
});

describe('NdjsonWorkEventStore (f00509 S1)', () => {
	let dir: string;
	let store: NdjsonWorkEventStore;

	beforeEach(() => {
		dir = makeTmpDir();
		store = new NdjsonWorkEventStore({
			path: join(dir, 'work-events.ndjson'),
		});
	});

	afterEach(() => {
		rmSync(dir, { recursive: true, force: true });
	});

	it('round-trips appended events even when the file did not exist', async () => {
		const first = await store.append({
			work_item_id: asWorkItemId('f00509/S1'),
			actor_id: null,
			kind: 'git_change',
			payload_hash: 'e'.repeat(64),
		});
		expect(first.id).toBe(1);
		const events = await store.list();
		expect(events).toHaveLength(1);
		expect(events[0]?.kind).toBe('git_change');
	});
});

describe('WorkEventStoreFacade (f00509 S1)', () => {
	let dir: string;

	beforeEach(() => {
		dir = makeTmpDir();
	});

	afterEach(() => {
		rmSync(dir, { recursive: true, force: true });
	});

	it('uses NDJSON when the config flag is absent or false', async () => {
		const facade = new WorkEventStoreFacade({ workspaceRoot: dir });
		expect(facade.activeBackend).toBe('ndjson');
		await facade.append({
			work_item_id: asWorkItemId('f00509/S1'),
			actor_id: null,
			kind: 'git_change',
			payload_hash: 'f'.repeat(64),
		});
		facade.close();
	});

	it('uses SQLite when the config flag is explicitly true', async () => {
		const configPath = join(dir, 'delendai.config.json');
		await Bun.write(
			configPath,
			JSON.stringify({
				state: { parity: { shadow: { enabled: true } } },
			}),
		);
		const facade = new WorkEventStoreFacade({
			workspaceRoot: dir,
			configPath,
		});
		expect(facade.activeBackend).toBe('sqlite');
		facade.close();
	});

	it('never throws at startup when the shadow is missing or disabled', () => {
		expect(
			() => new WorkEventStoreFacade({ workspaceRoot: dir }),
		).not.toThrow();
	});

	it('falls back to NDJSON when the config is malformed', async () => {
		const configPath = join(dir, 'delendai.config.json');
		await Bun.write(configPath, '{not json');
		const facade = new WorkEventStoreFacade({
			workspaceRoot: dir,
			configPath,
		});
		expect(facade.activeBackend).toBe('ndjson');
		facade.close();
	});
});

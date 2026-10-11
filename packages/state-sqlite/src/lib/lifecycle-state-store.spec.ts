import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { Database } from 'bun:sqlite';
import { describe, expect, it } from 'vitest';

import { SqliteLifecycleStateStore } from './lifecycle-state-store';

const memory = (): SqliteLifecycleStateStore =>
	new SqliteLifecycleStateStore(new Database(':memory:'), () => 1_000);

// Enough turns of the event loop for a caller that is not locked out to
// run its own steps in the middle of ours; no clock is involved.
const yieldToOthers = async (): Promise<void> => {
	for (let turn = 0; turn < 20; turn += 1) await Promise.resolve();
};

describe('SqliteLifecycleStateStore', () => {
	it('reports null before any epoch is written', async () => {
		expect(await memory().getAppliedEpoch('cache-layout')).toBeNull();
	});

	it('returns exactly the epoch it was given, not null', async () => {
		const store = memory();
		await store.setAppliedEpoch('cache-layout', 9);
		expect(await store.getAppliedEpoch('cache-layout')).toBe(9);
	});

	it('replaces the epoch in place', async () => {
		const db = new Database(':memory:');
		const store = new SqliteLifecycleStateStore(db, () => 2_000);
		await store.setAppliedEpoch('cache-layout', 9);
		await store.setAppliedEpoch('cache-layout', 10);
		expect(await store.getAppliedEpoch('cache-layout')).toBe(10);
		expect(
			db.query('SELECT count(*) AS n FROM lifecycle_meta;').get(),
		).toEqual({ n: 1 });
	});

	it('rolls the epoch back when the migration throws', async () => {
		const store = memory();
		await expect(
			store.withMigrationLock(async () => {
				await store.setAppliedEpoch('cache-layout', 9);
				throw new Error('boom');
			}),
		).rejects.toThrow('boom');
		expect(await store.getAppliedEpoch('cache-layout')).toBeNull();
	});

	it('keeps the epoch when the migration completes', async () => {
		const store = memory();
		await store.withMigrationLock(async () => {
			await store.setAppliedEpoch('cache-layout', 9);
		});
		expect(await store.getAppliedEpoch('cache-layout')).toBe(9);
	});

	it('queues migrations that start together in one process', async () => {
		const store = memory();
		const trace: string[] = [];
		const run = (name: string) =>
			store.withMigrationLock(async () => {
				trace.push(`${name}:start`);
				await yieldToOthers();
				trace.push(`${name}:end`);
			});
		await Promise.all([run('a'), run('b')]);
		expect(trace).toEqual(['a:start', 'a:end', 'b:start', 'b:end']);
	});

	it('survives a reopen of the database file', async () => {
		const path = join(
			mkdtempSync(join(tmpdir(), 'lifecycle-state-')),
			'state.sqlite',
		);
		const first = new Database(path);
		await new SqliteLifecycleStateStore(first).setAppliedEpoch(
			'cache-layout',
			9,
		);
		first.close();
		const second = new Database(path);
		expect(
			await new SqliteLifecycleStateStore(second).getAppliedEpoch(
				'cache-layout',
			),
		).toBe(9);
		second.close();
	});

	it('blocks a second connection until the first commits', async () => {
		const path = join(
			mkdtempSync(join(tmpdir(), 'lifecycle-state-')),
			'state.sqlite',
		);
		const a = new Database(path);
		const b = new Database(path);
		b.exec('PRAGMA busy_timeout = 0;');
		const storeA = new SqliteLifecycleStateStore(a);
		const storeB = new SqliteLifecycleStateStore(b);
		let secondRefused = false;
		await storeA.withMigrationLock(async () => {
			try {
				await storeB.withMigrationLock(async () => undefined);
			} catch {
				secondRefused = true;
			}
		});
		expect(secondRefused).toBe(true);
		a.close();
		b.close();
	});
});

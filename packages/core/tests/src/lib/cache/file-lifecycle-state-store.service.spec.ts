import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { createFileLifecycleStateStore } from '@delendai/core/lib/cache/file-lifecycle-state-store.service';
import { createTestWorkspace, removeTestWorkspace } from '../test-workspace';
import {
	recordPath,
	recordsDir,
} from '@delendai/core/lib/shared/delendai-records';

// Enough turns of the event loop for a caller that is not locked out to
// run its own steps in the middle of ours; no clock is involved.
const yieldToOthers = async (): Promise<void> => {
	for (let turn = 0; turn < 20; turn += 1) await Promise.resolve();
};

const workspaces: string[] = [];

const workspace = (): string => {
	const root = createTestWorkspace('delendai-lifecycle-');
	workspaces.push(root);
	return root;
};

afterEach(() => {
	for (const root of workspaces.splice(0)) removeTestWorkspace(root);
});

describe('createFileLifecycleStateStore', () => {
	it('reports no epoch for a workspace that never recorded one', async () => {
		const store = createFileLifecycleStateStore(workspace());
		expect(await store.getAppliedEpoch('cache-layout')).toBeNull();
	});

	it('returns exactly the epoch it was given', async () => {
		const root = workspace();
		await createFileLifecycleStateStore(root).setAppliedEpoch(
			'cache-layout',
			9,
		);
		// A fresh store, as a later boot would build, reads the same number.
		expect(
			await createFileLifecycleStateStore(root).getAppliedEpoch(
				'cache-layout',
			),
		).toBe(9);
	});

	it('writes the marker in the records folder and nowhere else', async () => {
		const root = workspace();
		await createFileLifecycleStateStore(root).setAppliedEpoch(
			'cache-layout',
			9,
		);
		const raw = await readFile(
			recordPath(root, 'cache-layout-applied.json'),
			'utf8',
		);
		expect(JSON.parse(raw)).toEqual({ 'cache-layout': 9 });
	});

	it('treats a damaged marker as no marker', async () => {
		const root = workspace();
		await mkdir(recordsDir(root), { recursive: true });
		await writeFile(
			recordPath(root, 'cache-layout-applied.json'),
			'{not json',
			'utf8',
		);
		const store = createFileLifecycleStateStore(root);
		expect(await store.getAppliedEpoch('cache-layout')).toBeNull();
		await store.setAppliedEpoch('cache-layout', 9);
		expect(await store.getAppliedEpoch('cache-layout')).toBe(9);
	});

	it('ignores an epoch that is not an integer', async () => {
		const root = workspace();
		await mkdir(recordsDir(root), { recursive: true });
		await writeFile(
			recordPath(root, 'cache-layout-applied.json'),
			'{"cache-layout":"9"}',
			'utf8',
		);
		expect(
			await createFileLifecycleStateStore(root).getAppliedEpoch(
				'cache-layout',
			),
		).toBeNull();
	});

	it('runs two simultaneous migrations one after the other', async () => {
		const store = createFileLifecycleStateStore(workspace());
		const trace: string[] = [];
		const run = (name: string) =>
			store.withMigrationLock(async () => {
				trace.push(`${name}:start`);
				await yieldToOthers();
				trace.push(`${name}:end`);
			});
		await Promise.all([run('a'), run('b')]);
		// Who wins the lock is not the point; that nobody overlaps is.
		const [first] = trace;
		const winner = first?.split(':')[0];
		const loser = winner === 'a' ? 'b' : 'a';
		expect(trace).toEqual([
			`${winner}:start`,
			`${winner}:end`,
			`${loser}:start`,
			`${loser}:end`,
		]);
	});

	it('lets the second caller see the epoch the first recorded', async () => {
		const root = workspace();
		const first = createFileLifecycleStateStore(root);
		const second = createFileLifecycleStateStore(root);
		const seen: (number | null)[] = [];
		const migrate = (store: typeof first) =>
			store.withMigrationLock(async () => {
				const applied = await store.getAppliedEpoch('cache-layout');
				seen.push(applied);
				if (applied === 9) return;
				await yieldToOthers();
				await store.setAppliedEpoch('cache-layout', 9);
			});
		await Promise.all([migrate(first), migrate(second)]);
		expect(seen).toEqual([null, 9]);
	});

	it('releases the lock when the migration throws', async () => {
		const store = createFileLifecycleStateStore(workspace());
		await expect(
			store.withMigrationLock(async () => {
				throw new Error('boom');
			}),
		).rejects.toThrow('boom');
		expect(await store.withMigrationLock(async () => 'again')).toBe(
			'again',
		);
	});
});

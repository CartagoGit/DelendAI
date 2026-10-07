import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { createFileLifecycleStateStore } from '@delendai/core/lib/cache/file-lifecycle-state-store.service';
import { CACHE_LAYOUT_MARKER_PATH } from '@delendai/core/lib/contracts/constants/cache-layout.constant';
import { createTestWorkspace, removeTestWorkspace } from '../test-workspace';

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

	it('writes the marker under .delendai and nowhere else', async () => {
		const root = workspace();
		await createFileLifecycleStateStore(root).setAppliedEpoch(
			'cache-layout',
			9,
		);
		const raw = await readFile(
			join(root, ...CACHE_LAYOUT_MARKER_PATH),
			'utf8',
		);
		expect(JSON.parse(raw)).toEqual({ 'cache-layout': 9 });
	});

	it('treats a damaged marker as no marker', async () => {
		const root = workspace();
		await mkdir(join(root, '.delendai'), { recursive: true });
		await writeFile(
			join(root, ...CACHE_LAYOUT_MARKER_PATH),
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
		await mkdir(join(root, '.delendai'), { recursive: true });
		await writeFile(
			join(root, ...CACHE_LAYOUT_MARKER_PATH),
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
				await new Promise((resolve) => setTimeout(resolve, 30));
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
				await new Promise((resolve) => setTimeout(resolve, 20));
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

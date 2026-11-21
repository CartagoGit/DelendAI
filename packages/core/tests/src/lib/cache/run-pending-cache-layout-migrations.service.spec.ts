import { mkdir, readdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import type { ILifecycleStateStore } from '@delendai/state';

import { createFileLifecycleStateStore } from '@delendai/core/lib/cache/file-lifecycle-state-store.service';
import {
	resetCacheLayoutEpochMemo,
	runPendingCacheLayoutMigrations,
} from '@delendai/core/lib/cache/run-pending-cache-layout-migrations.service';
import { CACHE_LAYOUT_MARKER_PATH } from '@delendai/core/lib/contracts/constants/cache-layout.constant';
import type {
	ICacheLayoutMigration,
	ICacheLayoutMigrationContext,
} from '@delendai/core/lib/contracts/interfaces/cache-layout.interface';
import { createTestWorkspace, removeTestWorkspace } from '../test-workspace';

const workspaces: string[] = [];
const TARGET = 3;

interface IProbe {
	readonly migrations: readonly ICacheLayoutMigration[];
	readonly detected: string[];
	readonly applied: string[];
	readonly contexts: ICacheLayoutMigrationContext[];
}

/** A chain 0 -> TARGET whose every step has something to do, unless told otherwise. */
const chain = (
	options: {
		readonly idle?: readonly number[];
		readonly failAt?: { value: number | undefined };
	} = {},
): IProbe => {
	const detected: string[] = [];
	const applied: string[] = [];
	const contexts: ICacheLayoutMigrationContext[] = [];
	const migrations = Array.from(
		{ length: TARGET },
		(_, fromEpoch): ICacheLayoutMigration => ({
			id: `step:${fromEpoch}`,
			fromEpoch,
			toEpoch: fromEpoch + 1,
			detect: async (ctx) => {
				detected.push(`step:${fromEpoch}`);
				contexts.push(ctx);
				return !(options.idle ?? []).includes(fromEpoch);
			},
			plan: async () => [{ kind: 'move', detail: `step ${fromEpoch}` }],
			apply: async () => {
				if (options.failAt?.value === fromEpoch)
					throw new Error(`crash in step ${fromEpoch}`);
				applied.push(`step:${fromEpoch}`);
			},
		}),
	);
	return { migrations, detected, applied, contexts };
};

const countingStore = (inner: ILifecycleStateStore) => {
	const calls = { reads: 0, writes: 0 };
	const store: ILifecycleStateStore = {
		getAppliedEpoch: async (scope) => {
			calls.reads += 1;
			return inner.getAppliedEpoch(scope);
		},
		setAppliedEpoch: async (scope, epoch) => {
			calls.writes += 1;
			return inner.setAppliedEpoch(scope, epoch);
		},
		withMigrationLock: (fn) => inner.withMigrationLock(fn),
	};
	return { store, calls };
};

const newWorkspace = (): string => {
	const root = createTestWorkspace('delendai-layout-');
	workspaces.push(root);
	return root;
};

const everything = async (root: string): Promise<readonly string[]> =>
	(await readdir(root, { recursive: true })).sort();

beforeEach(() => {
	resetCacheLayoutEpochMemo();
});

afterEach(() => {
	for (const root of workspaces.splice(0)) removeTestWorkspace(root);
});

const input = (
	root: string,
	store: ILifecycleStateStore,
	probe: IProbe,
	extra: { dryRun?: boolean; cacheDirAbs?: string } = {},
) => ({
	workspaceRoot: root,
	store,
	migrations: probe.migrations,
	resolveCacheDirAbs: async () =>
		extra.cacheDirAbs ?? join(root, '.cache', 'delendai'),
	targetEpoch: TARGET,
	...(extra.dryRun === undefined ? {} : { dryRun: extra.dryRun }),
});

describe('runPendingCacheLayoutMigrations', () => {
	it('does nothing when the build ships no layout migrations', async () => {
		const root = newWorkspace();
		const { store, calls } = countingStore(
			createFileLifecycleStateStore(root),
		);
		const probe = chain();
		expect(
			await runPendingCacheLayoutMigrations({
				...input(root, store, probe),
				migrations: [],
			}),
		).toEqual({ status: 'unregistered' });
		expect(calls).toEqual({ reads: 0, writes: 0 });
		expect(await everything(root)).toEqual([]);
	});

	describe('when the recorded epoch already matches', () => {
		it('reads the epoch once and touches nothing else', async () => {
			const root = newWorkspace();
			await createFileLifecycleStateStore(root).setAppliedEpoch(
				'cache-layout',
				TARGET,
			);
			const before = await everything(root);
			const { store, calls } = countingStore(
				createFileLifecycleStateStore(root),
			);
			const probe = chain();
			let cacheDirResolved = false;
			const result = await runPendingCacheLayoutMigrations({
				...input(root, store, probe),
				resolveCacheDirAbs: async () => {
					cacheDirResolved = true;
					return join(root, '.cache', 'delendai');
				},
			});
			expect(result).toEqual({ status: 'current' });
			expect(calls).toEqual({ reads: 1, writes: 0 });
			expect(cacheDirResolved).toBe(false);
			expect(probe.detected).toEqual([]);
			// No directory created, no file written: the tree is as it was.
			expect(await everything(root)).toEqual(before);
		});

		it('does not read again on a second call in the same process', async () => {
			const root = newWorkspace();
			await createFileLifecycleStateStore(root).setAppliedEpoch(
				'cache-layout',
				TARGET,
			);
			const { store, calls } = countingStore(
				createFileLifecycleStateStore(root),
			);
			const probe = chain();
			await runPendingCacheLayoutMigrations(input(root, store, probe));
			await runPendingCacheLayoutMigrations(input(root, store, probe));
			await runPendingCacheLayoutMigrations(input(root, store, probe));
			expect(calls.reads).toBe(1);
		});
	});

	it('runs the whole chain in order for a workspace with no recorded epoch, then records it', async () => {
		const root = newWorkspace();
		const store = createFileLifecycleStateStore(root);
		const probe = chain();
		const result = await runPendingCacheLayoutMigrations(
			input(root, store, probe),
		);
		expect(result).toMatchObject({
			status: 'migrated',
			fromEpoch: 0,
			toEpoch: TARGET,
		});
		expect(probe.applied).toEqual(['step:0', 'step:1', 'step:2']);
		expect(await store.getAppliedEpoch('cache-layout')).toBe(TARGET);
	});

	it('is a no-op on the second and third boot', async () => {
		const root = newWorkspace();
		const probe = chain();
		await runPendingCacheLayoutMigrations(
			input(root, createFileLifecycleStateStore(root), probe),
		);
		const detectedAfterFirst = probe.detected.length;
		for (let boot = 2; boot <= 3; boot += 1) {
			resetCacheLayoutEpochMemo();
			const next = await runPendingCacheLayoutMigrations(
				input(root, createFileLifecycleStateStore(root), probe),
			);
			expect(next).toEqual({ status: 'current' });
		}
		expect(probe.detected.length).toBe(detectedAfterFirst);
		expect(probe.applied.length).toBe(3);
	});

	it('skips steps that find nothing and writes nothing', async () => {
		const root = newWorkspace();
		const store = createFileLifecycleStateStore(root);
		const probe = chain({ idle: [0, 1, 2] });
		const result = await runPendingCacheLayoutMigrations(
			input(root, store, probe),
		);
		expect(result).toEqual({ status: 'current' });
		expect(probe.applied).toEqual([]);
		expect(await store.getAppliedEpoch('cache-layout')).toBeNull();
		expect(await everything(root)).toEqual([]);
	});

	it('leaves the epoch alone when a step crashes, and a retry finishes cleanly', async () => {
		const root = newWorkspace();
		const store = createFileLifecycleStateStore(root);
		const failAt = { value: 1 as number | undefined };
		const probe = chain({ failAt });
		const first = await runPendingCacheLayoutMigrations(
			input(root, store, probe),
		);
		expect(first).toEqual({
			status: 'failed',
			id: 'step:1',
			reason: 'crash in step 1',
		});
		expect(await store.getAppliedEpoch('cache-layout')).toBeNull();
		expect(probe.applied).toEqual(['step:0']);

		failAt.value = undefined;
		const retry = await runPendingCacheLayoutMigrations(
			input(root, store, probe),
		);
		expect(retry).toMatchObject({ status: 'migrated' });
		expect(await store.getAppliedEpoch('cache-layout')).toBe(TARGET);
	});

	it('plans without applying or recording on a dry run', async () => {
		const root = newWorkspace();
		const store = createFileLifecycleStateStore(root);
		const probe = chain();
		const result = await runPendingCacheLayoutMigrations(
			input(root, store, probe, { dryRun: true }),
		);
		expect(result).toMatchObject({ status: 'planned', fromEpoch: 0 });
		if (result.status !== 'planned') throw new Error('expected a plan');
		expect(result.pending.map((step) => step.id)).toEqual([
			'step:0',
			'step:1',
			'step:2',
		]);
		expect(probe.applied).toEqual([]);
		expect(probe.contexts.every((ctx) => ctx.dryRun)).toBe(true);
		expect(await store.getAppliedEpoch('cache-layout')).toBeNull();
		expect(await everything(root)).toEqual([]);
	});

	it('names the missing step when the chain has a gap', async () => {
		const root = newWorkspace();
		const store = createFileLifecycleStateStore(root);
		const probe = chain();
		const result = await runPendingCacheLayoutMigrations({
			...input(root, store, probe),
			migrations: [probe.migrations[0]!, probe.migrations[2]!],
		});
		expect(result).toEqual({
			status: 'failed',
			id: 'cache-layout',
			reason: 'no cache layout migration 1 -> 2',
		});
		expect(await store.getAppliedEpoch('cache-layout')).toBeNull();
	});

	it('refuses to downgrade a workspace recorded by a newer build', async () => {
		const root = newWorkspace();
		const store = createFileLifecycleStateStore(root);
		await store.setAppliedEpoch('cache-layout', TARGET + 4);
		const result = await runPendingCacheLayoutMigrations(
			input(root, store, chain()),
		);
		expect(result).toMatchObject({ status: 'failed', id: 'cache-layout' });
		expect(await store.getAppliedEpoch('cache-layout')).toBe(TARGET + 4);
	});

	it('operates on the cache directory it is given, not on the default', async () => {
		const root = newWorkspace();
		const custom = join(root, '.foo', 'bar');
		const probe = chain();
		await runPendingCacheLayoutMigrations(
			input(root, createFileLifecycleStateStore(root), probe, {
				cacheDirAbs: custom,
			}),
		);
		expect(probe.contexts.every((ctx) => ctx.cacheDirAbs === custom)).toBe(
			true,
		);
	});

	it('runs a migration once when two processes start together', async () => {
		const root = newWorkspace();
		const probe = chain();
		const results = await Promise.all([
			runPendingCacheLayoutMigrations(
				input(root, createFileLifecycleStateStore(root), probe),
			),
			runPendingCacheLayoutMigrations(
				input(root, createFileLifecycleStateStore(root), probe),
			),
		]);
		expect(results.map((result) => result.status).sort()).toEqual([
			'current',
			'migrated',
		]);
		expect(probe.applied).toEqual(['step:0', 'step:1', 'step:2']);
	});

	it('does not record the epoch when the cache directory cannot be resolved', async () => {
		const root = newWorkspace();
		const store = createFileLifecycleStateStore(root);
		const result = await runPendingCacheLayoutMigrations({
			...input(root, store, chain()),
			resolveCacheDirAbs: async () => {
				throw new Error('config unreadable');
			},
		});
		expect(result).toEqual({
			status: 'skipped',
			reason: 'config unreadable',
		});
		expect(await store.getAppliedEpoch('cache-layout')).toBeNull();
		await mkdir(join(root, '.delendai'), { recursive: true });
		await writeFile(join(root, ...CACHE_LAYOUT_MARKER_PATH), '{}', 'utf8');
	});
});

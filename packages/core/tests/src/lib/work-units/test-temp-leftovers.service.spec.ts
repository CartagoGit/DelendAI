/**
 * test-temp-leftovers.service.spec.ts — the old test temp directories
 * and the stray files of the units' folder, over injected roots.
 */
import {
	existsSync,
	mkdirSync,
	mkdtempSync,
	rmSync,
	utimesSync,
	writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { PRE_X01091_TEST_TEMP_PREFIXES } from '@delendai/core/lib/contracts/constants/test-temp-prefixes.constant';
import { reapTestTempLeftovers } from '@delendai/core/lib/work-units/test-temp-leftovers.service';
import { reconcileStrayFiles } from '@delendai/core/lib/ref-reconciler/unit-reconcile.service';

const roots: string[] = [];
afterEach(() => {
	for (const root of roots.splice(0))
		rmSync(root, { recursive: true, force: true });
});

const NOW_MS = Date.UTC(2026, 10, 18);
const DAY_S = 24 * 60 * 60;

/** A temp root with `name` made, last written `ageDays` before NOW. */
const folder = (): { root: string; make: (n: string, d: number) => string } => {
	const root = mkdtempSync(join(tmpdir(), 'leftovers-spec-'));
	roots.push(root);
	return {
		root,
		make: (name, ageDays) => {
			const path = join(root, name);
			mkdirSync(path);
			const at = (NOW_MS - ageDays * DAY_S * 1000) / 1000;
			utimesSync(path, at, at);
			return path;
		},
	};
};

describe('reapTestTempLeftovers', () => {
	it('[<50ms] has one constant naming the pre-x01091 prefixes', () => {
		expect(PRE_X01091_TEST_TEMP_PREFIXES).toContain('delendai-gh-');
		expect(PRE_X01091_TEST_TEMP_PREFIXES).toHaveLength(7);
	});

	it('[<100ms] removes an old empty match, keeps a fresh one, lists a non-empty one and ignores a foreign name', async () => {
		const { root, make } = folder();
		const old = make('delendai-gh-aaa', 3);
		const fresh = make('state-sqlite-bbb', 0.2);
		const full = make('tok-ccc', 3);
		writeFileSync(join(full, 'keep.txt'), 'x');
		const aged = (NOW_MS - 3 * DAY_S * 1000) / 1000;
		utimesSync(full, aged, aged);
		const foreign = make('somebody-else-ddd', 30);
		const result = await reapTestTempLeftovers({
			apply: true,
			tmpRoot: root,
			now: NOW_MS,
		});
		expect(result).toEqual({
			empty: 1,
			removed: 1,
			nonEmpty: ['tok-ccc'],
			nonEmptyCount: 1,
		});
		expect(existsSync(old)).toBe(false);
		expect(existsSync(fresh)).toBe(true);
		expect(existsSync(join(full, 'keep.txt'))).toBe(true);
		expect(existsSync(foreign)).toBe(true);
	});

	it('[<100ms] removes nothing without --apply', async () => {
		const { root, make } = folder();
		const old = make('unit-index-aaa', 3);
		const result = await reapTestTempLeftovers({
			apply: false,
			tmpRoot: root,
			now: NOW_MS,
		});
		expect(result).toMatchObject({ empty: 1, removed: 0 });
		expect(existsSync(old)).toBe(true);
	});
});

describe('reconcileStrayFiles', () => {
	const units = () => {
		const { root } = folder();
		const dir = join(root, '.cache', 'delendai', '.worktrees');
		mkdirSync(dir, { recursive: true });
		mkdirSync(join(dir, 'a-unit'));
		writeFileSync(join(dir, 'q48.md'), 'note');
		return { root, dir, unitsDirectory: dir };
	};

	it('[<100ms] moves a file that is no worktree under the cache root, deleting nothing', async () => {
		const { root, dir, unitsDirectory } = units();
		const moved = await reconcileStrayFiles({
			root,
			apply: true,
			now: 1,
			unitsDirectory,
		});
		const kept = join(
			root,
			'.cache/delendai/kept/worktrees-dir-files/q48.md',
		);
		expect(moved).toEqual([
			{
				name: 'q48.md',
				from: join(dir, 'q48.md'),
				to: kept,
				outcome: 'moved',
			},
		]);
		expect(existsSync(kept)).toBe(true);
		expect(existsSync(join(dir, 'q48.md'))).toBe(false);
		expect(existsSync(join(dir, 'a-unit'))).toBe(true);
	});

	it('[<100ms] only names the file without --apply', async () => {
		const { root, dir, unitsDirectory } = units();
		const [plan] = await reconcileStrayFiles({
			root,
			apply: false,
			now: 1,
			unitsDirectory,
		});
		expect(plan?.outcome).toBe('would-move');
		expect(existsSync(join(dir, 'q48.md'))).toBe(true);
	});

	it('[<100ms] never overwrites a file already kept under that name', async () => {
		const { root, dir, unitsDirectory } = units();
		await reconcileStrayFiles({
			root,
			apply: true,
			now: 1,
			unitsDirectory,
		});
		writeFileSync(join(dir, 'q48.md'), 'again');
		const [again] = await reconcileStrayFiles({
			root,
			apply: true,
			now: 2,
			unitsDirectory,
		});
		expect(again?.to.endsWith('q48.md.2')).toBe(true);
		expect(existsSync(again?.to ?? '')).toBe(true);
	});

	it('[<100ms] has nothing to keep when the units folder does not exist', async () => {
		const { root } = folder();
		expect(
			await reconcileStrayFiles({
				root,
				apply: true,
				now: 1,
				unitsDirectory: join(root, 'absent'),
			}),
		).toEqual([]);
	});
});

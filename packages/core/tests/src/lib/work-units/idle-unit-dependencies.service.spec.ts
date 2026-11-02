/**
 * idle-unit-dependencies.service.spec.ts — a kept unit nobody works on
 * gives its dependencies back; a live one keeps them.
 */
import { existsSync, mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { releaseIdleDependencies } from '@delendai/core/lib/work-units/idle-unit-dependencies.service';
import { reenteredUnit } from '@delendai/core/lib/work-units/kept-unit-hydration.service';
import { enteredDependencies } from '@delendai/core/lib/work-units/unit-dependencies.service';

describe('releaseIdleDependencies', () => {
	const roots: string[] = [];
	afterEach(() => {
		for (const root of roots.splice(0))
			rmSync(root, { recursive: true, force: true });
	});

	const worktree = (withModules: boolean): string => {
		const root = mkdtempSync(join(tmpdir(), 'idle-deps-'));
		roots.push(root);
		if (withModules)
			mkdirSync(join(root, 'node_modules', 'pkg'), { recursive: true });
		return root;
	};

	it('reports without --apply and removes with it, leaving live units alone', async () => {
		const idle = worktree(true);
		const live = worktree(true);
		// Quiet beyond the window but not abandoned: its owner may be working.
		const quiet = worktree(true);
		const bare = worktree(false);
		const units = [
			{ ref: 'wip/idle', worktree: idle, standing: 'abandoned' as const },
			{ ref: 'wip/quiet', worktree: quiet, standing: 'idle' as const },
			{ ref: 'wip/live', worktree: live, standing: 'live' as const },
			{ ref: 'wip/bare', worktree: bare, standing: 'abandoned' as const },
			{ ref: 'wip/gone', worktree: null, standing: 'idle' as const },
		];

		const reported = await releaseIdleDependencies({
			units,
			apply: false,
			quietSeconds: 60,
			now: Date.now() / 1000 + 3600,
		});
		expect(reported).toEqual([
			{ ref: 'wip/idle', worktree: idle, removed: false },
		]);
		expect(existsSync(join(idle, 'node_modules'))).toBe(true);

		const applied = await releaseIdleDependencies({
			units,
			apply: true,
			quietSeconds: 60,
			now: Date.now() / 1000 + 3600,
		});
		expect(applied).toEqual([
			{ ref: 'wip/idle', worktree: idle, removed: true },
		]);
		expect(existsSync(join(idle, 'node_modules'))).toBe(false);
		expect(existsSync(join(live, 'node_modules'))).toBe(true);
	});

	it('gives a unit entered again its dependencies, and a unit with no worktree nothing', async () => {
		const bare = worktree(false);
		expect(await enteredDependencies(undefined)).toEqual({});
		expect((await enteredDependencies(bare)).dependencies?.status).toBe(
			'skipped',
		);
		expect(
			await reenteredUnit(bare, undefined, 'wip/x', 'develop'),
		).toEqual({});
	});

	it('keeps the dependencies of an abandoned unit whose tree was written within the window', async () => {
		const recent = worktree(true);
		expect(
			await releaseIdleDependencies({
				units: [
					{
						ref: 'wip/recent',
						worktree: recent,
						standing: 'abandoned',
					},
				],
				apply: true,
				quietSeconds: 3600,
			}),
		).toEqual([]);
		expect(existsSync(join(recent, 'node_modules'))).toBe(true);
	});

	it('passes over a unit whose worktree is gone', async () => {
		const gone = join(worktree(false), 'not-there');
		expect(
			await releaseIdleDependencies({
				units: [
					{ ref: 'wip/gone', worktree: gone, standing: 'abandoned' },
				],
				apply: true,
				quietSeconds: 1,
			}),
		).toEqual([]);
	});
});

/**
 * idle-unit-dependencies.service.spec.ts — a kept unit nobody works on
 * gives its dependencies back; a live one keeps them.
 */
import { existsSync, mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { releaseIdleDependencies } from '@delendai/core/lib/work-units/idle-unit-dependencies.service';

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
		const bare = worktree(false);
		const units = [
			{ ref: 'wip/idle', worktree: idle, standing: 'idle' as const },
			{ ref: 'wip/live', worktree: live, standing: 'live' as const },
			{ ref: 'wip/bare', worktree: bare, standing: 'abandoned' as const },
			{ ref: 'wip/gone', worktree: null, standing: 'idle' as const },
		];

		const reported = await releaseIdleDependencies({ units, apply: false });
		expect(reported).toEqual([
			{ ref: 'wip/idle', worktree: idle, removed: false },
		]);
		expect(existsSync(join(idle, 'node_modules'))).toBe(true);

		const applied = await releaseIdleDependencies({ units, apply: true });
		expect(applied).toEqual([
			{ ref: 'wip/idle', worktree: idle, removed: true },
		]);
		expect(existsSync(join(idle, 'node_modules'))).toBe(false);
		expect(existsSync(join(live, 'node_modules'))).toBe(true);
	});
});

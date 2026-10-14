/**
 * hook-free-environment.helper.spec.ts — git started from a hook answers
 * about the repository its `cwd` names, not the hook's.
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import {
	gitEnvironmentFor,
	hookFreeEnvironment,
} from '@delendai/core/lib/shared/hook-free-environment.helper';
import { readGit } from '@delendai/core/lib/work-units/work-unit-shared.service';

describe('hookFreeEnvironment', () => {
	const dirs: string[] = [];
	afterEach(() => {
		for (const dir of dirs.splice(0))
			rmSync(dir, { recursive: true, force: true });
	});
	const repo = (): string => {
		const root = mkdtempSync(join(tmpdir(), 'hook-env-'));
		dirs.push(root);
		execFileSync('git', ['init', '-q'], { cwd: root });
		return root;
	};

	it('drops what git told the hook, so git reads the repository cwd names', () => {
		const mine = repo();
		const hooks = repo();
		const inHook = {
			...process.env,
			GIT_DIR: join(hooks, '.git'),
			GIT_INDEX_FILE: join(hooks, '.git', 'index'),
		};
		const top = (env: NodeJS.ProcessEnv) =>
			execFileSync('git', ['rev-parse', '--absolute-git-dir'], {
				cwd: mine,
				env,
				encoding: 'utf8',
			}).trim();
		expect(top(inHook)).toBe(join(hooks, '.git'));
		expect(top(hookFreeEnvironment(inHook))).toBe(join(mine, '.git'));
		expect(hookFreeEnvironment(inHook).GIT_DIR).toBeUndefined();
	});
});

describe('gitEnvironmentFor', () => {
	const dirs: string[] = [];
	afterEach(() => {
		for (const dir of dirs.splice(0))
			rmSync(dir, { recursive: true, force: true });
	});
	const repo = (): string => {
		const root = mkdtempSync(join(tmpdir(), 'hook-env-'));
		dirs.push(root);
		execFileSync('git', ['init', '-q'], { cwd: root });
		return root;
	};
	const hookOf = (root: string): NodeJS.ProcessEnv => ({
		...process.env,
		GIT_DIR: join(root, '.git'),
		GIT_INDEX_FILE: join(root, '.git', 'index'),
	});

	it("keeps what git told the hook for the hook's own worktree", () => {
		const hooks = repo();
		const env = hookOf(hooks);
		expect(gitEnvironmentFor(hooks, env).GIT_INDEX_FILE).toBe(
			env.GIT_INDEX_FILE,
		);
		expect(
			gitEnvironmentFor(hooks, { ...env, GIT_WORK_TREE: hooks }).GIT_DIR,
		).toBe(env.GIT_DIR);
	});

	it('drops it for any other repository, and is a no-op outside a hook', () => {
		const hooks = repo();
		const other = repo();
		expect(gitEnvironmentFor(other, hookOf(hooks)).GIT_DIR).toBeUndefined();
		const plain = { PATH: process.env.PATH };
		expect(gitEnvironmentFor(other, plain)).toBe(plain);
	});

	it("takes a linked worktree's hook to be the directory it runs in", () => {
		const env = { ...process.env, GIT_DIR: '/x/.git/worktrees/unit' };
		expect(gitEnvironmentFor(process.cwd(), env).GIT_DIR).toBe(env.GIT_DIR);
		expect(gitEnvironmentFor('/elsewhere', env).GIT_DIR).toBeUndefined();
	});

	it("lets readGit see another unit's own changes from inside a hook", () => {
		const hooks = repo();
		const other = repo();
		writeFileSync(join(hooks, 'hook-edit.txt'), 'x\n');
		const saved = {
			GIT_DIR: process.env.GIT_DIR,
			GIT_INDEX_FILE: process.env.GIT_INDEX_FILE,
		};
		Object.assign(process.env, hookOf(hooks));
		try {
			expect(readGit(other, ['status', '--porcelain'])).toBe('');
		} finally {
			for (const [name, value] of Object.entries(saved)) {
				if (value === undefined) delete process.env[name];
				else process.env[name] = value;
			}
		}
	});
});

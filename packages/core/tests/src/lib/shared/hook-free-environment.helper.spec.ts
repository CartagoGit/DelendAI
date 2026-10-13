/**
 * hook-free-environment.helper.spec.ts — git started from a hook answers
 * about the repository its `cwd` names, not the hook's.
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { hookFreeEnvironment } from '@delendai/core/lib/shared/hook-free-environment.helper';

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

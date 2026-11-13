/**
 * git-optional-locks.helper.spec.ts — a git read run through the seam
 * leaves the index it read alone.
 */
import { execFileSync } from 'node:child_process';
import { statSync, utimesSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { createGitRepoTemplate } from '@delendai/test-kit';

import {
	applyGitOptionalLocksDefault,
	withoutOptionalLocks,
} from '@delendai/core/lib/shared/git-optional-locks.helper';
import { runGitCommand } from '@delendai/core/lib/shared/git-command.helper';
import { gitEnvironmentFor } from '@delendai/core/lib/shared/hook-free-environment.helper';
import { createScopedGitRunner } from '@delendai/core/lib/wip-engine/git-command';

const HOUR_MS = 3_600_000;

describe('git reads leave the index alone', () => {
	const template = createGitRepoTemplate({
		files: { 'a.txt': 'a\n' },
	});

	/** A repository whose index is old, so a plain status would rewrite it. */
	const staleRepo = () => {
		const { root } = template.copy();
		const old = new Date(Date.now() - 48 * HOUR_MS);
		const older = new Date(Date.now() - 49 * HOUR_MS);
		utimesSync(join(root, 'a.txt'), older, older);
		utimesSync(join(root, '.git', 'index'), old, old);
		const indexMtime = () => statSync(join(root, '.git', 'index')).mtimeMs;
		return { root, indexMtime, before: indexMtime() };
	};

	it('would rewrite it without the seam (the premise)', () => {
		const { root, indexMtime, before } = staleRepo();
		execFileSync('git', ['status', '--porcelain'], {
			cwd: root,
			env: { ...process.env, GIT_OPTIONAL_LOCKS: '1' },
		});
		expect(indexMtime()).not.toBe(before);
	});

	it('runGitCommand status leaves the index mtime unchanged', () => {
		const { root, indexMtime, before } = staleRepo();
		const done = runGitCommand(root, ['status', '--porcelain']);
		expect(done.ok).toBe(true);
		expect(indexMtime()).toBe(before);
	});

	it('the work-ref engine runner leaves it unchanged too', async () => {
		const { root, indexMtime, before } = staleRepo();
		await createScopedGitRunner(root)(['status', '--porcelain']);
		expect(indexMtime()).toBe(before);
	});

	it('gitEnvironmentFor and withoutOptionalLocks both switch it off', () => {
		expect(gitEnvironmentFor('/x', {}).GIT_OPTIONAL_LOCKS).toBe('0');
		expect(withoutOptionalLocks({ A: '1' })).toEqual({
			A: '1',
			GIT_OPTIONAL_LOCKS: '0',
		});
	});

	it('the process default keeps a choice the caller made', () => {
		const env: NodeJS.ProcessEnv = {};
		applyGitOptionalLocksDefault(env);
		expect(env.GIT_OPTIONAL_LOCKS).toBe('0');
		const chosen: NodeJS.ProcessEnv = { GIT_OPTIONAL_LOCKS: '1' };
		applyGitOptionalLocksDefault(chosen);
		expect(chosen.GIT_OPTIONAL_LOCKS).toBe('1');
	});
});

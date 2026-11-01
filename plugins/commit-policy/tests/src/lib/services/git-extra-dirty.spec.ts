/**
 * git-extra-dirty.spec.ts — the dirty-path readers against a real git
 * repository: NUL-separated porcelain keeps paths verbatim, and an
 * untracked folder is counted by the files inside it.
 */

import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import {
	gitDirtyFileCount,
	gitDirtyFilePaths,
} from '@delendai/commit-policy/lib/services/git-extra';

import { runGit, withTempRepo } from './commit-driver-harness';

describe('gitDirtyFilePaths (real git)', () => {
	it('returns a path with spaces verbatim so `git add` stages it', async () => {
		await withTempRepo(async ({ repoDir, git }) => {
			await writeFile(join(repoDir, 'my file é.txt'), 'x\n');
			const paths = await gitDirtyFilePaths(git);
			expect(paths).toEqual(['my file é.txt']);
			const added = await git(['add', '--', ...paths]);
			expect(added.ok).toBe(true);
			expect(
				await runGit(repoDir, [
					'-c',
					'core.quotePath=false',
					'diff',
					'--cached',
					'--name-only',
				]),
			).toBe('my file é.txt');
		});
	});

	it('counts the files of an untracked folder, not the folder', async () => {
		await withTempRepo(async ({ repoDir, git }) => {
			await mkdir(join(repoDir, 'newdir'));
			for (const name of ['a.ts', 'b.ts', 'c.ts']) {
				await writeFile(join(repoDir, 'newdir', name), 'x\n');
			}
			expect(await gitDirtyFileCount(git)).toBe(3);
			expect(await gitDirtyFilePaths(git)).toEqual([
				'newdir/a.ts',
				'newdir/b.ts',
				'newdir/c.ts',
			]);
		});
	});

	it('reports a renamed file by its target only', async () => {
		await withTempRepo(async ({ repoDir, git, trackedFile }) => {
			await runGit(repoDir, [
				'mv',
				trackedFile,
				join(repoDir, 'renamed file.ts'),
			]);
			expect(await gitDirtyFilePaths(git)).toEqual(['renamed file.ts']);
		});
	});
});

/**
 * generated-refresh.service.spec.ts — after a merge, what the generators
 * say about the finished tree is what gets committed.
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import {
	captureWorkingState,
	workingStateChanges,
} from '@delendai/test-kit/public';

import { GENERATED_REFRESH_PATHS } from '../contracts/constants/generated-refresh.constant';
import { refreshGeneratedAfterMerge } from './generated-refresh.service';

const roots: string[] = [];
const GENERATED = GENERATED_REFRESH_PATHS[0] as string;

const git = (cwd: string, ...args: string[]): string =>
	execFileSync('git', args, { cwd, encoding: 'utf8' }).trim();

const repo = (): string => {
	const root = mkdtempSync(join(tmpdir(), 'generated-refresh-'));
	roots.push(root);
	git(root, 'init', '-q', '-b', 'develop');
	git(root, 'config', 'user.email', 'gen@example.com');
	git(root, 'config', 'user.name', 'Gen');
	git(root, 'config', 'commit.gpgsign', 'false');
	execFileSync('mkdir', ['-p', join(root, 'docs/delendai/host-hints')]);
	writeFileSync(join(root, GENERATED), 'count: 1\n');
	writeFileSync(join(root, 'authored.ts'), 'export const a = 1;\n');
	git(root, 'add', '-A');
	git(root, 'commit', '-q', '-m', 'base');
	return root;
};

afterEach(() => {
	for (const root of roots.splice(0)) {
		rmSync(root, { recursive: true, force: true });
	}
});

describe('refreshGeneratedAfterMerge (x00559)', () => {
	it('commits exactly what the generators changed', () => {
		const root = repo();
		const outcome = refreshGeneratedAfterMerge({
			root,
			paths: GENERATED_REFRESH_PATHS,
			run: (_command, cwd) => {
				writeFileSync(join(cwd, GENERATED), 'count: 2\n');
				return true;
			},
		});
		expect(outcome).toMatchObject({
			refreshed: true,
			committed: true,
			failed: [],
			paths: [GENERATED],
		});
		expect(git(root, 'status', '--porcelain')).toBe('');
		expect(git(root, 'log', '-1', '--format=%s')).toBe(
			'chore(generated): recompute after a merge',
		);
		expect(readFileSync(join(root, GENERATED), 'utf8')).toBe('count: 2\n');
	});

	it('leaves the checkout exactly as found when the commit is refused', () => {
		const root = repo();
		// A hook that refuses, the way `refuse-integration-commit` does in
		// the pinned checkout on the integration branch.
		const hook = join(root, '.git', 'hooks', 'pre-commit');
		writeFileSync(hook, '#!/bin/sh\nexit 1\n');
		execFileSync('chmod', ['+x', hook]);
		const before = readFileSync(join(root, GENERATED), 'utf8');

		const outcome = refreshGeneratedAfterMerge({
			root,
			paths: GENERATED_REFRESH_PATHS,
			run: (_command, cwd) => {
				writeFileSync(join(cwd, GENERATED), 'count: 99\n');
				return true;
			},
		});

		expect(outcome).toMatchObject({ refreshed: true, committed: false });
		// The refusal is the right answer, and it costs nothing: no staged
		// file, no modified file, no commit. A shared checkout left dirty
		// after a merge carries a change no agent made and no branch can
		// accept — the state the work-ref model exists to make impossible.
		expect(git(root, 'status', '--porcelain')).toBe('');
		expect(readFileSync(join(root, GENERATED), 'utf8')).toBe(before);
		expect(git(root, 'log', '-1', '--format=%s')).toBe('base');
	});

	it('commits nothing when the generators agree with the tree', () => {
		const root = repo();
		const before = git(root, 'rev-parse', 'HEAD');
		const outcome = refreshGeneratedAfterMerge({
			root,
			paths: GENERATED_REFRESH_PATHS,
			run: () => true,
		});
		expect(outcome).toMatchObject({ refreshed: true, committed: false });
		expect(outcome.paths).toEqual([]);
		expect(git(root, 'rev-parse', 'HEAD')).toBe(before);
	});

	it('never sweeps in work that is not generated, even when it is already staged', () => {
		const root = repo();
		writeFileSync(join(root, 'authored.ts'), 'export const a = 2;\n');
		// The previous test only left it dirty. An agent that had already
		// run `git add` would have had its work absorbed by a `git commit`
		// with no paths — the promise of isolation, broken quietly.
		execFileSync('git', ['add', 'authored.ts'], { cwd: root });
		refreshGeneratedAfterMerge({
			root,
			paths: GENERATED_REFRESH_PATHS,
			run: (_command, cwd) => {
				writeFileSync(join(cwd, GENERATED), 'count: 3\n');
				return true;
			},
		});
		// The generated file landed; the authored edit is still the
		// author's to commit.
		expect(git(root, 'show', '--name-only', '--format=', 'HEAD')).toBe(
			GENERATED,
		);
		expect(git(root, 'status', '--porcelain')).toContain('authored.ts');
	});

	it('never commits a generated path that already carried an uncommitted edit', () => {
		// Measured on 2026-09-24: a hand edit, uncommitted when a merge
		// ran, was committed as "recompute after a merge".
		const root = repo();
		writeFileSync(join(root, GENERATED), 'an edit nobody committed yet\n');
		const outcome = refreshGeneratedAfterMerge({
			root,
			paths: GENERATED_REFRESH_PATHS,
			run: (_command, cwd) => {
				writeFileSync(join(cwd, GENERATED), 'count: 5\n');
				return true;
			},
		});
		expect(outcome.committed).toBe(false);
		expect(outcome.paths).toEqual([]);
		expect(git(root, 'log', '-1', '--format=%s')).toBe('base');
		expect(readFileSync(join(root, GENERATED), 'utf8')).toBe(
			'an edit nobody committed yet\n',
		);
	});

	it('reports a generator that failed and commits nothing of its own', () => {
		const root = repo();
		const outcome = refreshGeneratedAfterMerge({
			root,
			paths: GENERATED_REFRESH_PATHS,
			run: () => false,
		});
		expect(outcome.failed.length).toBeGreaterThan(0);
		expect(outcome.committed).toBe(false);
	});

	it('resolves the whole path, not one character short', () => {
		// The first real run staged `ocs/delendai/…` and reported nothing
		// to commit while the file sat dirty: the porcelain status was
		// being sliced by column position.
		const root = repo();
		const outcome = refreshGeneratedAfterMerge({
			root,
			paths: GENERATED_REFRESH_PATHS,
			run: (_command, cwd) => {
				writeFileSync(join(cwd, GENERATED), 'count: 4\n');
				return true;
			},
		});
		expect(outcome.paths).toEqual([GENERATED]);
		expect(outcome.paths[0]?.startsWith('docs/')).toBe(true);
	});
});

describe('a rollback restores what it found, not what was committed', () => {
	/** A repository whose commit is refused, as the integration branch is. */
	const refusing = (): string => {
		const root = repo();
		const hook = join(root, '.git', 'hooks', 'pre-commit');
		writeFileSync(hook, '#!/bin/sh\nexit 1\n');
		execFileSync('chmod', ['+x', hook]);
		return root;
	};

	it('keeps an uncommitted edit the generators overwrote', () => {
		// Restoring to HEAD would have replaced somebody's unsaved edit
		// with the last commit, silently.
		const root = refusing();
		writeFileSync(join(root, GENERATED), 'a paragraph nobody committed\n');

		const outcome = refreshGeneratedAfterMerge({
			root,
			paths: GENERATED_REFRESH_PATHS,
			run: (_command, cwd) => {
				writeFileSync(join(cwd, GENERATED), 'count: 99\n');
				return true;
			},
		});

		expect(outcome.committed).toBe(false);
		expect(readFileSync(join(root, GENERATED), 'utf8')).toBe(
			'a paragraph nobody committed\n',
		);
	});

	it('keeps an edit that was already staged, still staged', () => {
		const root = refusing();
		writeFileSync(join(root, GENERATED), 'staged by a person\n');
		git(root, 'add', GENERATED);

		refreshGeneratedAfterMerge({
			root,
			paths: GENERATED_REFRESH_PATHS,
			run: (_command, cwd) => {
				writeFileSync(join(cwd, GENERATED), 'count: 99\n');
				return true;
			},
		});

		expect(readFileSync(join(root, GENERATED), 'utf8')).toBe(
			'staged by a person\n',
		);
		expect(git(root, 'diff', '--cached', '--name-only')).toContain(
			GENERATED,
		);
	});

	it('still leaves a clean checkout clean', () => {
		// The invariant the rollback existed for in the first place.
		const root = refusing();
		const outcome = refreshGeneratedAfterMerge({
			root,
			paths: GENERATED_REFRESH_PATHS,
			run: (_command, cwd) => {
				writeFileSync(join(cwd, GENERATED), 'count: 99\n');
				return true;
			},
		});
		expect(outcome.committed).toBe(false);
		expect(git(root, 'status', '--porcelain')).toBe('');
	});
});

describe('the index goes back exactly, including a partial stage', () => {
	const refusing = (): string => {
		const root = repo();
		const hook = join(root, '.git', 'hooks', 'pre-commit');
		writeFileSync(hook, '#!/bin/sh\nexit 1\n');
		execFileSync('chmod', ['+x', hook]);
		return root;
	};

	it('does not promote unstaged edits when a file was half staged', () => {
		// Half staged is an ordinary thing to be in the middle of: some
		// hunks added, more editing still in the worktree. Restoring that
		// with `git add` promotes the unstaged half, quietly changing what
		// the next commit would contain.
		const root = refusing();
		writeFileSync(join(root, GENERATED), 'staged half\n');
		git(root, 'add', GENERATED);
		const stagedBlob = git(root, 'ls-files', '--stage', GENERATED);
		writeFileSync(join(root, GENERATED), 'staged half\nunstaged half\n');

		refreshGeneratedAfterMerge({
			root,
			paths: GENERATED_REFRESH_PATHS,
			run: (_command, cwd) => {
				writeFileSync(join(cwd, GENERATED), 'count: 99\n');
				return true;
			},
		});

		// The worktree is what the person had…
		expect(readFileSync(join(root, GENERATED), 'utf8')).toBe(
			'staged half\nunstaged half\n',
		);
		// …and the index still holds only the half they staged.
		expect(git(root, 'ls-files', '--stage', GENERATED)).toBe(stagedBlob);
	});

	it('leaves a path git never tracked untracked', () => {
		const root = refusing();
		const outcome = refreshGeneratedAfterMerge({
			root,
			paths: GENERATED_REFRESH_PATHS,
			run: (_command, cwd) => {
				writeFileSync(join(cwd, GENERATED), 'count: 99\n');
				return true;
			},
		});
		expect(outcome.committed).toBe(false);
		expect(git(root, 'status', '--porcelain')).toBe('');
	});
});

describe('the uncommitted work around a refresh (x00635)', () => {
	it('is left exactly as found, staged, partly staged and untracked alike', () => {
		const root = repo();
		writeFileSync(join(root, 'authored.ts'), 'export const a = 2;\n');
		git(root, 'add', 'authored.ts');
		writeFileSync(join(root, 'authored.ts'), 'export const a = 3;\n');
		writeFileSync(join(root, 'untracked.ts'), 'export {};\n');
		const before = captureWorkingState(root);

		const outcome = refreshGeneratedAfterMerge({
			root,
			paths: GENERATED_REFRESH_PATHS,
			run: (_command, cwd) => {
				writeFileSync(join(cwd, GENERATED), 'count: 7\n');
				return true;
			},
		});

		expect(outcome.committed).toBe(true);
		expect(workingStateChanges(before)).toEqual([]);
	});
});

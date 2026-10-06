/**
 * wip-repo.ts — real temporary git repositories for the WIP engine specs.
 *
 * These tests are worth nothing against a mocked runner. The engine's
 * claims are claims ABOUT GIT — that `.git/index` is byte-identical after
 * a checkpoint, that HEAD did not move, that a foreign dirty file did not
 * get staged — and a fake runner would happily "prove" all three while
 * the real plumbing did the opposite. So every spec builds an actual
 * repository, commits actual files, and inspects the actual `.git`
 * directory afterwards.
 *
 * `createTestWorkspace` (the shared helper) supplies the temp directory;
 * everything git-specific lives here.
 */

import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

import { createTestWorkspace, removeTestWorkspace } from '../test-workspace';

/** A throwaway repository plus the helpers a spec needs against it. */
export interface IWipTestRepo {
	readonly dir: string;
	/** Run git in the repo and return trimmed stdout. Throws on failure. */
	readonly git: (...args: readonly string[]) => string;
	/** Write a file (creating parents) relative to the repo root. */
	readonly write: (path: string, content: string) => void;
	/** Read a working-tree file; `undefined` when it does not exist. */
	readonly read: (path: string) => string | undefined;
	/** Stage + commit everything currently in the tree; returns the sha. */
	readonly commitAll: (message: string) => string;
	/** Raw bytes of `.git/index`, for the contamination assertion. */
	readonly indexBytes: () => Buffer;
	readonly cleanup: () => void;
}

/** The branch every spec keeps HEAD pinned to. */
export const INTEGRATION_BRANCH = 'develop';

export const createWipTestRepo = (): IWipTestRepo => {
	const dir = createTestWorkspace('delendai-wip-engine-');
	const git = (...args: readonly string[]): string =>
		execFileSync('git', [...args], {
			cwd: dir,
			encoding: 'utf8',
			env: {
				...process.env,
				GIT_AUTHOR_NAME: 'Test',
				GIT_AUTHOR_EMAIL: 'test@example.com',
				GIT_COMMITTER_NAME: 'Test',
				GIT_COMMITTER_EMAIL: 'test@example.com',
			},
		}).trim();

	const write = (path: string, content: string): void => {
		mkdirSync(dirname(join(dir, path)), { recursive: true });
		writeFileSync(join(dir, path), content, 'utf8');
	};
	const read = (path: string): string | undefined => {
		try {
			return readFileSync(join(dir, path), 'utf8');
		} catch {
			return undefined;
		}
	};

	git('init', '--quiet', '--initial-branch', INTEGRATION_BRANCH);
	git('config', 'user.name', 'Test');
	git('config', 'user.email', 'test@example.com');
	git('config', 'commit.gpgsign', 'false');
	// Never let a developer's global hooks run inside a spec.
	git('config', 'core.hooksPath', join(dir, '.no-hooks'));

	const commitAll = (message: string): string => {
		git('add', '-A');
		git('commit', '--quiet', '--no-verify', '-m', message);
		return git('rev-parse', 'HEAD');
	};

	return {
		dir,
		git,
		write,
		read,
		commitAll,
		indexBytes: () => readFileSync(join(dir, '.git', 'index')),
		cleanup: () => removeTestWorkspace(dir),
	};
};

/** HEAD's commit and branch — the pair every spec asserts is untouched. */
export const headState = (
	repo: IWipTestRepo,
): { readonly commit: string; readonly branch: string } => ({
	commit: repo.git('rev-parse', 'HEAD'),
	branch: repo.git('rev-parse', '--abbrev-ref', 'HEAD'),
});

/** Paths a commit's tree contains, sorted. */
export const treePaths = (
	repo: IWipTestRepo,
	revision: string,
): readonly string[] =>
	repo
		.git('ls-tree', '-r', '--name-only', revision)
		.split('\n')
		.map((line) => line.trim())
		.filter((line) => line.length > 0)
		.sort();

/** Paths a commit changed relative to its first parent, sorted. */
export const changedPaths = (
	repo: IWipTestRepo,
	revision: string,
): readonly string[] =>
	repo
		.git('diff', '--name-only', `${revision}^`, revision)
		.split('\n')
		.map((line) => line.trim())
		.filter((line) => line.length > 0)
		.sort();

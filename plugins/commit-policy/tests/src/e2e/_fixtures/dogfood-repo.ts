/**
 * Shared real-git fixture for the commit-policy end-to-end specs.
 *
 * Every case needs the same thing: a workspace on `develop` with one
 * commit, a bare remote it can actually push to, and a topic branch to
 * work on. Building that inline meant the file grew past the point
 * where anyone could see which test asserted what, so it lives here and
 * the specs state only their own behaviour.
 */
import { execFile } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';

import { createWriteGitRunner } from '@mcp-vertex/core/public';
import type { IGitRunner } from '@mcp-vertex/core/public';

const execFileAsync = promisify(execFile);

/**
 * Every git call in this fixture runs with `GIT_CONFIG_GLOBAL` pointed
 * at a scratch file.
 *
 * The fixture needs a *global* config, because `identity: { mode:
 * 'global' }` is one of the behaviours under test. It previously got one
 * by running `git config --global user.email ...` — which writes to the
 * developer's real `~/.gitconfig`. Two consequences, both observed on
 * this machine: parallel test files raced for the config lock and one
 * failed with `could not lock config file`, and, far worse, the
 * machine's actual git identity was silently replaced with
 * `cartago@example.com`, so commits made outside commit-policy's
 * explicit-author path were attributed to a fixture address.
 *
 * A test may not write to anything outside its own temp directory.
 * Scoping "global" per invocation gives the fixture exactly the config
 * it needs, isolates parallel runs from each other, and leaves the
 * developer's machine alone.
 */
export const git = (
	cwd: string,
	...args: readonly string[]
): ReturnType<typeof execFileAsync> =>
	execFileAsync('git', [...args], {
		cwd,
		env: {
			...process.env,
			GIT_CONFIG_GLOBAL: join(cwd, '.fixture-gitconfig'),
		},
	});

export interface IDogfoodRepo {
	workspace: string;
	remote: string;
	runner: IGitRunner;
}

/** Create the workspace + bare remote pair, on a topic branch. */
export const createDogfoodRepo = async (): Promise<IDogfoodRepo> => {
	const workspace = await mkdtemp(join(tmpdir(), 'commit-policy-dogfood-'));
	const remote = await mkdtemp(join(tmpdir(), 'commit-policy-remote-'));
	await git(workspace, 'init', '-q', '-b', 'develop');
	await git(workspace, 'config', 'user.email', 'cartago@example.com');
	await git(workspace, 'config', 'user.name', 'Cartago');
	await git(
		workspace,
		'config',
		'--global',
		'user.email',
		'cartago@example.com',
	);
	await git(workspace, 'config', '--global', 'user.name', 'Cartago');
	await writeFile(join(workspace, 'README.md'), '# init\n', 'utf8');
	await git(workspace, 'add', '.');
	await git(workspace, 'commit', '-q', '-m', 'chore: init');
	await execFileAsync(
		'git',
		['init', '-q', '--bare', '--initial-branch=develop'],
		{ cwd: remote },
	).catch(async () => {
		// Older git builds reject `--initial-branch` on a bare init.
		await execFileAsync('git', ['init', '-q', '--bare'], { cwd: remote });
		await execFileAsync(
			'git',
			['symbolic-ref', 'HEAD', 'refs/heads/develop'],
			{ cwd: remote },
		);
	});
	await git(workspace, 'remote', 'add', 'origin', remote);
	await git(workspace, 'push', '-q', '-u', 'origin', 'develop');
	await git(workspace, 'checkout', '-q', '-b', 'topic/e2e-test');
	return { workspace, remote, runner: createWriteGitRunner(workspace) };
};

export const cleanupDogfoodRepo = async (
	repo: Pick<IDogfoodRepo, 'workspace' | 'remote'>,
): Promise<void> => {
	if (repo.workspace.length > 0) {
		await rm(repo.workspace, { recursive: true, force: true });
	}
	if (repo.remote.length > 0) {
		await rm(repo.remote, { recursive: true, force: true });
	}
};

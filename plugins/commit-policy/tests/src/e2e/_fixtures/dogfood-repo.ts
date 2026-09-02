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
 * The scratch file this fixture uses as its "global" git config.
 *
 * The fixture genuinely needs a global config, because
 * `identity: { mode: 'global' }` is one of the behaviours under test. It
 * used to get one by running `git config --global user.email ...`, which
 * writes to the developer's real `~/.gitconfig`. Two consequences, both
 * observed on this machine: parallel test files raced for the config
 * lock and one failed with `could not lock config file`, and — far worse
 * — the machine's actual git identity was silently replaced with
 * `cartago@example.com`, so every commit made outside commit-policy's
 * explicit-author path was attributed to a fixture address.
 *
 * A test may not write anywhere outside its own temp directory. Pointing
 * `GIT_CONFIG_GLOBAL` at a scratch file gives the fixture exactly the
 * config it needs, isolates parallel runs, and leaves the developer's
 * machine alone. It lives OUTSIDE the workspace on purpose: a config
 * file inside it would show up as an untracked path and be swept into
 * the very commits these tests assert about.
 */
let activeConfigDir: string | undefined;
let previousConfigGlobal: string | undefined;
let hadConfigGlobal = false;

export const git = (cwd: string, ...args: readonly string[]) =>
	execFileAsync('git', [...args], { cwd });

export interface IDogfoodRepo {
	workspace: string;
	remote: string;
	runner: IGitRunner;
}

/** Create the workspace + bare remote pair, on a topic branch. */
export const createDogfoodRepo = async (): Promise<IDogfoodRepo> => {
	const workspace = await mkdtemp(join(tmpdir(), 'commit-policy-dogfood-'));
	const remote = await mkdtemp(join(tmpdir(), 'commit-policy-remote-'));
	// Redirect "global" git config BEFORE the first git call. The env var
	// is set on the process rather than per-spawn because the code under
	// test builds its own git runner, and it has to see the same global
	// config the fixture wrote. `cleanupDogfoodRepo` restores it.
	activeConfigDir = await mkdtemp(join(tmpdir(), 'commit-policy-gitcfg-'));
	hadConfigGlobal = 'GIT_CONFIG_GLOBAL' in process.env;
	previousConfigGlobal = process.env.GIT_CONFIG_GLOBAL;
	process.env.GIT_CONFIG_GLOBAL = join(activeConfigDir, 'gitconfig');
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
	// Put the process env back exactly as it was, including the case
	// where the variable was not set at all — leaving it pointing at a
	// deleted directory would make every later git call in this worker
	// silently run with no global config.
	if (hadConfigGlobal) {
		process.env.GIT_CONFIG_GLOBAL = previousConfigGlobal;
	} else {
		delete process.env.GIT_CONFIG_GLOBAL;
	}
	if (activeConfigDir !== undefined) {
		await rm(activeConfigDir, { recursive: true, force: true });
		activeConfigDir = undefined;
	}
};

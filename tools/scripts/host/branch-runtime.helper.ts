/**
 * branch-runtime.helper.ts — a project picks the delendai branch it runs.
 *
 * Until delendai is on a registry, a project's MCP entry points at this
 * repository's host script, so it ran whatever this checkout held and
 * restarted every time work landed here. `--branch=<name>` runs that branch
 * instead, from a detached worktree delendai keeps in its own cache: the
 * checkout stays where it is, and only that branch moving can restart the
 * server. A branch that does not exist falls back to the checkout's code,
 * and says so.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

import { withFileMutex } from '@delendai/core/runtime';

const BRANCH_FLAG = '--branch=';
const RUNTIME_DIR = '.cache/delendai/branch-runtime';
const HOST_SCRIPT = 'tools/scripts/host/host-server.script.ts';
const SAFE_BRANCH = /^[\w][\w./-]*$/u;

type TRun = (
	command: string,
	args: readonly string[],
	cwd: string,
) => string | undefined;

const runQuietly: TRun = (command, args, cwd) => {
	try {
		return execFileSync(command, [...args], {
			cwd,
			encoding: 'utf8',
			stdio: ['ignore', 'pipe', 'ignore'],
		}).trim();
	} catch {
		return undefined;
	}
};

/** The branch asked for, without its quotes, when there is one. */
export const branchFlag = (argv: readonly string[]): string | undefined => {
	const value = argv
		.find((arg) => arg.startsWith(BRANCH_FLAG))
		?.slice(BRANCH_FLAG.length)
		.replace(/^["']|["']$/gu, '');
	return value === undefined || value.length === 0 ? undefined : value;
};

export const withoutBranchFlag = (argv: readonly string[]): readonly string[] =>
	argv.filter((arg) => !arg.startsWith(BRANCH_FLAG));

/** The host script of `branch`, up to date; `undefined` when there is no such branch. */
const updatedHostScript = (
	root: string,
	branch: string,
	run: TRun,
): string | undefined => {
	// Offline a project still starts, on what this clone last saw.
	run('git', ['fetch', '--quiet', 'origin', branch], root);
	const sha =
		run('git', ['rev-parse', '-q', '--verify', `origin/${branch}`], root) ??
		run('git', ['rev-parse', '-q', '--verify', branch], root);
	if (sha === undefined || sha.length === 0) return undefined;
	const tree = join(root, RUNTIME_DIR, branch.replaceAll('/', '-'));
	if (existsSync(tree)) {
		run('git', ['checkout', '--quiet', '--detach', sha], tree);
	} else {
		run('git', ['worktree', 'add', '--quiet', '--detach', tree, sha], root);
	}
	if (!existsSync(join(tree, HOST_SCRIPT))) return undefined;
	// Scripts off: an install script once rewrote the shared git config.
	run('bun', ['install', '--frozen-lockfile', '--ignore-scripts'], tree);
	return join(tree, HOST_SCRIPT);
};

/**
 * Projects on different branches never meet: each branch has its own tree.
 * Two on one branch can start together, and one of them must not run a tree
 * the other is still installing, so a branch is prepared by one at a time.
 */
export const branchHostScript = async (
	root: string,
	branch: string,
	run: TRun = runQuietly,
): Promise<string | undefined> => {
	if (!SAFE_BRANCH.test(branch)) return undefined;
	mkdirSync(join(root, RUNTIME_DIR), { recursive: true });
	return withFileMutex(
		join(root, RUNTIME_DIR, `${branch.replaceAll('/', '-')}.lock`),
		async () => updatedHostScript(root, branch, run),
	);
};

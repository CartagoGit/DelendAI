/**
 * hook-free-environment.helper.ts — the environment for work a git hook
 * starts, without what git told the hook about its own repository.
 *
 * A hook runs with `GIT_DIR`, `GIT_INDEX_FILE` and their kin set to the
 * worktree it fired in. A process the hook starts inherits them, and every
 * git command it runs then answers about that worktree whatever `cwd` it
 * is given: the publication a `post-commit` hook started removed the
 * worktree and then failed every step after, reading a repository that no
 * longer existed.
 */
import { basename, dirname, resolve } from 'node:path';

import { HOOK_GIT_ENVIRONMENT } from '../contracts/constants/hook-git-environment.constant';

export const hookFreeEnvironment = (
	env: NodeJS.ProcessEnv = process.env,
): NodeJS.ProcessEnv => {
	const clean: NodeJS.ProcessEnv = { ...env };
	for (const name of HOOK_GIT_ENVIRONMENT) delete clean[name];
	return clean;
};

/**
 * The worktree a hook fired in: where git told it its work tree is, the
 * directory holding a main checkout's `.git`, or, for a linked worktree,
 * the directory git starts its hooks in.
 */
const hookWorktree = (env: NodeJS.ProcessEnv, gitDir: string): string => {
	if (env.GIT_WORK_TREE !== undefined) return resolve(env.GIT_WORK_TREE);
	const absolute = resolve(gitDir);
	return basename(absolute) === '.git' ? dirname(absolute) : process.cwd();
};

/**
 * The environment for a git command run in `cwd`. Inside a hook, what git
 * told the hook holds only for the hook's own worktree: asked of another
 * unit, `git status` under the hook's `GIT_DIR` and `GIT_INDEX_FILE`
 * reported the hook's changes as that unit's, and every unit in the clone
 * looked as if it held the same uncommitted edits.
 */
export const gitEnvironmentFor = (
	cwd: string,
	env: NodeJS.ProcessEnv = process.env,
): NodeJS.ProcessEnv => {
	const gitDir = env.GIT_DIR;
	if (gitDir === undefined) return env;
	return resolve(cwd) === hookWorktree(env, gitDir)
		? env
		: hookFreeEnvironment(env);
};

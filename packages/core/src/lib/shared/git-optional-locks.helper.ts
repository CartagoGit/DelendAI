/**
 * git-optional-locks.helper.ts — git's read commands do not write the
 * repository they read.
 *
 * `git status` quietly rewrites an index it finds stale (and takes
 * `index.lock` to do it). The index's mtime is the signal this project
 * reads as "when did anyone last work in this worktree", so a status run
 * to LOOK made the worktree look busy, and two agents reading the same
 * repository contended for the lock. `GIT_OPTIONAL_LOCKS=0` is git's own
 * switch for exactly this: it turns off the locks and writes that are
 * only an optimisation and changes nothing a command is asked to do.
 */

import { GIT_OPTIONAL_LOCKS_ENV } from '../contracts/constants/git-optional-locks.constant';

/** `env` with git's optional locks and writes off. */
export const withoutOptionalLocks = (
	env: NodeJS.ProcessEnv = process.env,
): NodeJS.ProcessEnv => ({ ...env, [GIT_OPTIONAL_LOCKS_ENV]: '0' });

/**
 * Make it the default of this process, so every git it spawns inherits it,
 * including the many callers that pass `{ ...process.env, X }`. A caller
 * that sets it itself keeps its choice. Called once by each process entry.
 */
export const applyGitOptionalLocksDefault = (
	env: NodeJS.ProcessEnv = process.env,
): void => {
	env[GIT_OPTIONAL_LOCKS_ENV] ??= '0';
};

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
import { HOOK_GIT_ENVIRONMENT } from '../contracts/constants/hook-git-environment.constant';

export const hookFreeEnvironment = (
	env: NodeJS.ProcessEnv = process.env,
): NodeJS.ProcessEnv => {
	const clean: NodeJS.ProcessEnv = { ...env };
	for (const name of HOOK_GIT_ENVIRONMENT) delete clean[name];
	return clean;
};

/**
 * What git exports to a hook about the repository it runs in. A git
 * command a hook starts inherits them and answers about that working tree,
 * whatever `cwd` it is given. The object-directory pair is what a
 * `pre-receive` hook's quarantine sets: a nested command that keeps them
 * writes into a quarantine git is about to discard.
 */
export const HOOK_GIT_ENVIRONMENT = [
	'GIT_DIR',
	'GIT_WORK_TREE',
	'GIT_INDEX_FILE',
	'GIT_PREFIX',
	'GIT_COMMON_DIR',
	'GIT_OBJECT_DIRECTORY',
	'GIT_ALTERNATE_OBJECT_DIRECTORIES',
] as const;

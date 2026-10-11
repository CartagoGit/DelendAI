/**
 * What git exports to a hook about the repository it runs in. A git
 * command a hook starts inherits them and answers about that working tree,
 * whatever `cwd` it is given.
 */
export const HOOK_GIT_ENVIRONMENT = [
	'GIT_DIR',
	'GIT_WORK_TREE',
	'GIT_INDEX_FILE',
	'GIT_PREFIX',
	'GIT_COMMON_DIR',
] as const;

/** The one status every dirty-state reader asks (worktree-status.helper). */
export const WORKTREE_STATUS_ARGS: readonly string[] = [
	'status',
	'--porcelain=v2',
	'--branch',
	'-z',
	'--untracked-files=all',
];

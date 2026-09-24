/**
 * What runs in a candidate's throwaway worktree after the merge, as `bun`
 * arguments, in order. The worktree starts with no dependencies, so it
 * installs them from the merged lockfile; then `gen:all`, the one list of
 * every generator. This used to be a second, shorter list (the catalog
 * and the quantitative block), which is how a candidate could come back
 * with every other derived file stale.
 */
export const GENERATED_REFRESH_COMMANDS: readonly string[] = [
	'install --frozen-lockfile',
	'run gen:all',
];

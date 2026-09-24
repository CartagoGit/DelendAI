/**
 * The generators re-run after a merge. Only the catalog and what it
 * renders: `AGENT-BOOTSTRAP.md` carried a generated count block until it
 * was removed (a count over the whole repository has no per-branch
 * answer), and the bootstrap is otherwise written by hand, so nothing
 * automatic commits it any more.
 */
export const GENERATED_REFRESH_COMMANDS: readonly string[] = [
	'catalog:generate',
];

/**
 * The only paths the refresh may commit. Bounding it is what stops a
 * post-merge commit from sweeping in work that is not its own.
 */
export const GENERATED_REFRESH_PATHS: readonly string[] = [
	'docs/delendai/agent-catalog.generated.json',
	'docs/delendai/host-hints/agent-instructions.generated.md',
];

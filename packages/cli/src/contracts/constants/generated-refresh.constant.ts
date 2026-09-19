/**
 * The generators re-run after a merge, in the order they must run: the
 * catalog first, because the quantitative block counts what it renders.
 */
export const GENERATED_REFRESH_COMMANDS: readonly string[] = [
	'catalog:generate',
	'gen:quantitative',
];

/**
 * The only paths the refresh may commit. Bounding it is what stops a
 * post-merge commit from sweeping in work that is not its own.
 */
export const GENERATED_REFRESH_PATHS: readonly string[] = [
	'docs/delendai/AGENT-BOOTSTRAP.md',
	'docs/delendai/agent-catalog.generated.json',
	'docs/delendai/host-hints/agent-instructions.generated.md',
];

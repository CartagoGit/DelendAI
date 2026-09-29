/** Constants for `no-hardcoded-branch-names.script.ts`. */

/**
 * Branch names that belong to a project, not to the product.
 *
 * Deliberately the common trunk names only. A rule that flagged every
 * string would be noise; these three are the ones this codebase actually
 * assumed, and the ones a new assumption would reach for.
 */
export const BRANCH_LITERALS: readonly string[] = [
	'develop',
	'master',
	'trunk',
];

/** Where product source lives. Tests are excluded by the scanner. */
export const SOURCE_GLOBS: readonly string[] = [
	'packages/*/src/**/*.ts',
	'plugins/*/src/**/*.ts',
];

/** Files accepted for now, so the rule bites on what arrives next. */
export const BASELINE_PATH =
	'tools/scripts/lint/no-hardcoded-branch-names.baseline.json';

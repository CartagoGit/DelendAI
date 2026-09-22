/** Constants for `./default-branch`. */

/**
 * The names projects give their trunk, as a LAST resort and only when
 * exactly one of them exists.
 *
 * Ordered by nothing: the order cannot matter, because more than one
 * match is treated as no answer at all. A repository holding both `main`
 * and `develop` has made a choice this list cannot read, and guessing
 * between them is how a tool tells somebody to switch to a branch that
 * means something else in their project.
 */
export const CONVENTIONAL_TRUNKS = [
	'main',
	'master',
	'develop',
	'trunk',
] as const;

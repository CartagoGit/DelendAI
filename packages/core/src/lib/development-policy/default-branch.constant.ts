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
 *
 * `lint:no-hardcoded-branch-names` is waived for this file, and only
 * this one. Everywhere else a branch name in source is this project's
 * habit leaking into somebody else's repository — the exact defect
 * x00602 exists to fix. Here the names are the PAYLOAD: a list of what
 * other projects call their trunk, read only to RECOGNISE one, never to
 * assume it. The same distinction x00595 had to teach the brand sweep.
 */
export const CONVENTIONAL_TRUNKS = [
	'main',
	'master',
	'develop',
	'trunk',
] as const;

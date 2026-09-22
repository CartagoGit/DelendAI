/** Constants for `no-home-directory-in-tracked-files.script.ts`. */

/**
 * What an absolute home directory looks like on each platform.
 *
 * Deliberately anchored on the home ROOT rather than any absolute path:
 * `/usr/bin/env` and `/etc/hosts` are the same everywhere and say
 * nothing about whose machine wrote them.
 */
export const HOME_PATTERNS: readonly RegExp[] = [
	/\/home\/[A-Za-z0-9][A-Za-z0-9._-]*\//u,
	/\/Users\/[A-Za-z0-9][A-Za-z0-9._-]*\//u,
	/[A-Z]:\\Users\\[A-Za-z0-9][A-Za-z0-9._-]*\\/u,
];

/**
 * Where historical prose lives.
 *
 * An audit written months ago that quotes a terminal session is a
 * RECORD. Rewriting it would falsify what was observed, and it is never
 * installed anywhere. Live configuration is what this rule is for.
 */
export const SKIP_PREFIXES: readonly string[] = [
	'docs/delendai/proposals/done/',
	'docs/delendai/proposals/legacy/',
	'docs/delendai/proposals/retired/',
	'.cache/',
	// This rule's own spec. It has to contain the shapes it detects, the
	// way a spec for a secret scanner has to contain something that looks
	// like a secret. Exempted by name rather than baselined, because it
	// is not debt and will never be paid down.
	'tools/scripts/lint/no-home-directory-in-tracked-files.script.spec.ts',
];

/** Paths accepted for now, so the rule bites on what arrives next. */
export const BASELINE_PATH =
	'tools/scripts/lint/no-home-directory-in-tracked-files.baseline.json';

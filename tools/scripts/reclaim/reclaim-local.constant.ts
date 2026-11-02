/** Constants for `./reclaim-local.script`. */

/**
 * Branches that are never candidates, whatever a config says.
 *
 * A floor, not a default: the project's declared integration and
 * release branches are ADDED to this list rather than replacing it, so
 * a config that omits one — or a config that fails to parse — cannot
 * make `main` reapable.
 */
export const DEFAULT_PROTECTED: readonly string[] = [
	'develop',
	'main',
	'master',
];

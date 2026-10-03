/** Constants for config transitions. */

/**
 * Where the configuration last applied to a workspace is recorded.
 *
 * Next to `migrations-applied.json` and for the same reasons: `.delendai/`
 * is the gitignored home for runtime-owned workspace state, and it sits
 * outside the cache directory — which is precisely one of the things a
 * transition may move.
 */
export const APPLIED_CONFIG_PATH = [
	'.delendai',
	'applied-config.json',
] as const;

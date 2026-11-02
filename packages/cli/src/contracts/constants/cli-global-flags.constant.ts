/**
 * The CLI's global flags, which the parser consumes (x00705).
 */

/**
 * Flags the parser takes out of every command's arguments into `globals`.
 * A command that reads one of these from `args` reads nothing.
 */
export const GLOBAL_FLAGS_WITH_VALUE: ReadonlySet<string> = new Set([
	'workspace',
	'remote',
	'format',
	'lang',
	'plugins',
	'preset',
	'config',
]);

/** Every flag the parser consumes from a command's arguments. */
export const CONSUMED_GLOBAL_FLAGS: ReadonlySet<string> = new Set([
	...GLOBAL_FLAGS_WITH_VALUE,
	'json',
	'no-color',
]);

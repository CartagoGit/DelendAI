/**
 * import-only-change.helper.ts — a file whose only change is where its
 * names are imported from did not change what it does.
 */

/**
 * What a module imports and re-exports from elsewhere: the statements
 * that say where its names come from, on one line or several.
 */
const IMPORT_STATEMENT =
	/^[ \t]*(?:import\s+(?:type\s+)?[\w*{][^;]*?from\s*['"][^'"]+['"]|import\s*['"][^'"]+['"]|export\s+(?:type\s+)?[*{][^;=]*?from\s*['"][^'"]+['"])\s*;?[ \t]*$/gmu;

/** A module's text without its imports, and without the gaps they leave. */
export const behaviourOf = (text: string): string =>
	text
		.replaceAll(IMPORT_STATEMENT, '')
		.split('\n')
		.map((line) => line.trimEnd())
		.filter((line) => line.length > 0)
		.join('\n');

/**
 * True when a file's only change is where its names are imported from.
 *
 * Moving an export from one entry point to another rewrites an import
 * line in every consumer. None of them does anything new, and none of
 * their statements ran or stopped running because of it: judged as
 * changed code, each one brought its whole untested past into a pull
 * request that had not touched it. A file that did not exist before, or
 * whose remaining text differs by one character, is still judged.
 */
export const onlyImportsChanged = (
	before: string | undefined,
	after: string | undefined,
): boolean =>
	before !== undefined &&
	after !== undefined &&
	behaviourOf(before) === behaviourOf(after);

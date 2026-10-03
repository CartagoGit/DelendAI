/**
 * import-only-change.helper.ts — a file whose only change is where its
 * names are imported from, or what its comments say, did not change what
 * it does.
 */

/**
 * What a module imports and re-exports from elsewhere: the statements
 * that say where its names come from, on one line or several.
 */
const IMPORT_STATEMENT =
	/^[ \t]*(?:import\s+(?:type\s+)?[\w*{][^;]*?from\s*['"][^'"]+['"]|import\s*['"][^'"]+['"]|export\s+(?:type\s+)?[*{][^;=]*?from\s*['"][^'"]+['"])\s*;?[ \t]*$/gmu;

/**
 * The lines of a module that are not a comment standing on its own: a
 * `//` line, or a block opened by a line that starts with `/*`. A comment
 * after code on the same line stays with its line, so nothing here has to
 * tell a comment from the inside of a string.
 */
const withoutComments = (text: string): readonly string[] => {
	const kept: string[] = [];
	let inBlock = false;
	for (const line of text.split('\n')) {
		const trimmed = line.trim();
		if (inBlock) {
			inBlock = !trimmed.includes('*/');
			continue;
		}
		if (trimmed.startsWith('//')) continue;
		if (trimmed.startsWith('/*')) {
			inBlock = !trimmed.includes('*/');
			continue;
		}
		kept.push(line);
	}
	return kept;
};

/**
 * A module's text without its comments and imports, and without the gaps
 * they leave.
 */
export const behaviourOf = (text: string): string =>
	withoutComments(text)
		.join('\n')
		.replaceAll(IMPORT_STATEMENT, '')
		.split('\n')
		.map((line) => line.trimEnd())
		.filter((line) => line.length > 0)
		.join('\n');

/**
 * True when a file's only change is where its names are imported from,
 * or the comments that stand on their own lines.
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

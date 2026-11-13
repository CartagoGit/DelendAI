/**
 * land-zones.helper.ts — the project's zones are the globs of its
 * `development.integration.zones`. A zone is named by its last literal
 * path segment (`packages/core/**` is `core`), which is also what a check
 * names when it reports that zone (`tests: core 2/4`).
 */

/** The name a zone glob carries. */
export const zoneNameOf = (glob: string): string =>
	glob
		.split('/')
		.filter((segment) => segment !== '' && !/[*?[{]/u.test(segment))
		.at(-1) ?? glob;

const globToRegExp = (glob: string): RegExp =>
	new RegExp(
		`^${glob
			.replace(/\/\*\*$/u, '')
			.replace(/[.+^$()|\\]/gu, '\\$&')
			.replace(/\*\*\/?/gu, '@@globstar@@')
			.replace(/\*/gu, '[^/]*')
			.replace(/\?/gu, '[^/]')
			.replace(/@@globstar@@/gu, '(?:.*/)?')}(?:/.*)?$`,
		'u',
	);

/**
 * The zones `files` fall in; `undefined` (every zone) when a file falls in
 * none, or the project declares no zone: such a change may reach anything.
 */
export const zonesOfFiles = (
	zones: readonly string[],
	files: ReadonlySet<string>,
): ReadonlySet<string> | undefined => {
	if (zones.length === 0) return undefined;
	const patterns = zones.map((glob) => ({
		name: zoneNameOf(glob),
		pattern: globToRegExp(glob),
	}));
	const reached = new Set<string>();
	for (const file of files) {
		const owners = patterns.filter(({ pattern }) => pattern.test(file));
		if (owners.length === 0) return undefined;
		for (const { name } of owners) reached.add(name);
	}
	return reached;
};

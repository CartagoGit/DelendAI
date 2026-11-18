/** Constants for the no-legacy-cache-paths lint. */

/**
 * The retired product name, assembled so that this file does not contain
 * the very path it forbids elsewhere.
 */
const RETIRED_NAME = ['mcp', 'vertex'].join('-');

/** The legacy cache locations: `.cache/<retired>` and `.<retired>`. */
export const LEGACY_CACHE_PATH_PATTERN = new RegExp(
	`\\.cache/${RETIRED_NAME}|\\.${RETIRED_NAME}`,
	'u',
);

/** Roots whose source files must not name a legacy cache path. */
export const SCANNED_ROOTS: readonly string[] = [
	'packages/',
	'plugins/',
	'tools/',
	'apps/',
	'extensions/',
];

export const SCANNED_EXTENSIONS = /\.(ts|tsx|js|mjs|cjs)$/u;

/**
 * Where naming the old path is the point: the migrators have to know it to
 * find it. Tests and fixtures prove compatibility and may keep the literal.
 */
export const LEGACY_PATH_ALLOWED: readonly RegExp[] = [
	/^packages\/core\/src\/lib\/workspace-migration\/migrat(ors|ions)\//u,
	/^packages\/core\/src\/lib\/cache\/(migrations\/|cache-layout-migration)/u,
	/\.(spec|test)\.[cm]?[jt]sx?$/u,
	/(^|\/)(tests?|migration-fixtures|__fixtures__|fixtures)\//u,
];

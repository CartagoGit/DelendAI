/**
 * search-engine.constants.ts — Solid-SRP extraction (pure data).
 *
 * Defaults and clamps shared by every search backend. Split out so
 * the in-house walker, the rg backend, and any future strategy can
 * import the exact same constants — no risk of one backend silently
 * diverging from another (e.g. an in-house `MAX_FILE_BYTES` of 2 MB
 * vs an rg `--max-count` of 50).
 */

export const DEFAULT_EXTENSIONS: readonly string[] = [
	'ts',
	'tsx',
	'js',
	'jsx',
	'mjs',
	'cjs',
	'json',
	'md',
	'mdx',
	'txt',
	'yml',
	'yaml',
	'toml',
	'css',
	'scss',
	'html',
	'svg',
	'sh',
];

export const DEFAULT_IGNORE_DIRS: readonly string[] = [
	'node_modules',
	'.git',
	'dist',
	'build',
	'coverage',
	'.cache',
	'.next',
	'.turbo',
	'out',
	'.vscode-test',
];

// Skip files larger than this (likely generated/binary); keep the scan cheap.
export const MAX_FILE_BYTES = 1024 * 1024;
export const MAX_LINE_PREVIEW = 240;

/** Solid-SRP: pure number-clamping helpers. Testable in isolation. */
export const clampMaxResults = (value: number | undefined): number => {
	if (value === undefined || Number.isNaN(value)) return 50;
	return Math.max(1, Math.min(500, Math.floor(value)));
};

export const clampContext = (value: number | undefined): number => {
	if (value === undefined || Number.isNaN(value)) return 0;
	return Math.max(0, Math.min(10, Math.floor(value)));
};

/** Lower-cased file extension, or '' when the path has no dot. */
export const extensionOf = (name: string): string => {
	const dot = name.lastIndexOf('.');
	return dot < 0 ? '' : name.slice(dot + 1).toLowerCase();
};

/** Truncate a long line for the preview payload. */
export const preview = (line: string): string =>
	line.length > MAX_LINE_PREVIEW
		? `${line.slice(0, MAX_LINE_PREVIEW)}…`
		: line;

/** True iff `relPath` matches any compiled glob regex. */
export const matchesAnyGlob = (
	relPath: string,
	globs: readonly RegExp[],
): boolean => globs.some((re) => re.test(relPath));

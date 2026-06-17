import { readdir, readFile, stat } from 'node:fs/promises';
import { join, relative, sep } from 'node:path';

/** One matching line. `file` is relative to the workspace root. */
export interface ISearchHit {
	readonly file: string;
	readonly line: number;
	readonly text: string;
}

export interface ISearchResult {
	readonly query: string;
	readonly hits: readonly ISearchHit[];
	/** True when the result set was capped at `maxResults`. */
	readonly truncated: boolean;
	readonly scanned: number;
}

export interface ISearchOptions {
	/** Dirs (relative to the workspace root) to search. Default `['.']`. */
	readonly roots?: readonly string[];
	/** File extensions (without dot) to include. Default: a text set. */
	readonly extensions?: readonly string[];
	/** Max hits before truncating. Default 50, clamped to [1, 500]. */
	readonly maxResults?: number;
	/** Case-sensitive match. Default false. */
	readonly caseSensitive?: boolean;
	/** Directory names to skip entirely. Default: build/vcs/dep dirs. */
	readonly ignoreDirs?: readonly string[];
	/** Treat `query` as a JS regular expression instead of a literal substring. */
	readonly regex?: boolean;
	/**
	 * Glob(s) on the relative file path a file must match to be searched
	 * (e.g. `src/**\/*.ts`). When given, this REPLACES the extension allow-list.
	 */
	readonly include?: readonly string[];
	/** Glob(s) on the relative file path to exclude (takes priority). */
	readonly exclude?: readonly string[];
}

/** Thrown when `regex: true` and `query` is not a valid regular expression. */
export class InvalidSearchPatternError extends Error {
	constructor(
		readonly pattern: string,
		readonly detail: string
	) {
		super(`invalid regex "${pattern}": ${detail}`);
		this.name = 'InvalidSearchPatternError';
	}
}

/**
 * Convert a path glob to an anchored RegExp. Supports `**` (any path span,
 * including `/`), `*` (any run within a path segment), and `?` (one non-`/`
 * char). Everything else is matched literally.
 */
const globToRegExp = (glob: string): RegExp => {
	let re = '';
	for (let i = 0; i < glob.length; i += 1) {
		const c = glob[i] as string;
		if (c === '*') {
			if (glob[i + 1] === '*') {
				if (glob[i + 2] === '/') {
					// `**/` = zero or more path segments (so `src/**/*.ts`
					// also matches `src/a.ts`).
					re += '(?:.*/)?';
					i += 2;
				} else {
					re += '.*';
					i += 1;
				}
			} else {
				re += '[^/]*';
			}
		} else if (c === '?') {
			re += '[^/]';
		} else if ('.+^()|[]{}$\\'.includes(c)) {
			re += `\\${c}`;
		} else {
			re += c;
		}
	}
	return new RegExp(`^${re}$`);
};

const matchesAnyGlob = (
	relPath: string,
	globs: readonly RegExp[]
): boolean => globs.some((re) => re.test(relPath));

const DEFAULT_EXTENSIONS: readonly string[] = [
	'ts', 'tsx', 'js', 'jsx', 'mjs', 'cjs', 'json', 'md', 'mdx', 'txt',
	'yml', 'yaml', 'toml', 'css', 'scss', 'html', 'svg', 'sh',
];

const DEFAULT_IGNORE_DIRS: readonly string[] = [
	'node_modules', '.git', 'dist', 'build', 'coverage', '.cache', '.next',
	'.turbo', 'out', '.vscode-test',
];

// Skip files larger than this (likely generated/binary); keep the scan cheap.
const MAX_FILE_BYTES = 1024 * 1024;
const MAX_LINE_PREVIEW = 240;

const extensionOf = (name: string): string => {
	const dot = name.lastIndexOf('.');
	return dot < 0 ? '' : name.slice(dot + 1).toLowerCase();
};

const clampMaxResults = (value: number | undefined): number => {
	if (value === undefined || Number.isNaN(value)) return 50;
	return Math.max(1, Math.min(500, Math.floor(value)));
};

/**
 * Live, grep-like textual search over the workspace. Pure over the
 * injected absolute root: walks `roots`, reads allow-listed text files
 * (capped in size), and returns the matching lines (capped in count). No
 * persisted index — cheap and always fresh for the small/medium trees an
 * MCP host serves. mcp-core stays agnostic: roots/extensions/ignored
 * dirs are all injectable.
 */
export const searchWorkspace = async (
	workspaceRootAbs: string,
	query: string,
	options: ISearchOptions = {}
): Promise<ISearchResult> => {
	const trimmed = query.trim();
	const maxResults = clampMaxResults(options.maxResults);
	if (trimmed.length === 0) {
		return { query, hits: [], truncated: false, scanned: 0 };
	}

	const roots = options.roots && options.roots.length > 0 ? options.roots : ['.'];
	const extensions = new Set(
		(options.extensions && options.extensions.length > 0
			? options.extensions
			: DEFAULT_EXTENSIONS
		).map((e) => e.toLowerCase())
	);
	const ignoreDirs = new Set(options.ignoreDirs ?? DEFAULT_IGNORE_DIRS);
	const caseSensitive = options.caseSensitive ?? false;

	// Line matcher: regex (compiled once) or literal substring.
	let matches: (line: string) => boolean;
	if (options.regex) {
		let re: RegExp;
		try {
			re = new RegExp(trimmed, caseSensitive ? '' : 'i');
		} catch (err) {
			throw new InvalidSearchPatternError(trimmed, String(err));
		}
		matches = (line) => re.test(line);
	} else {
		const needle = caseSensitive ? trimmed : trimmed.toLowerCase();
		matches = (line) =>
			(caseSensitive ? line : line.toLowerCase()).includes(needle);
	}

	// Path filters: include globs REPLACE the extension allow-list; exclude
	// globs always win. Compiled once.
	const includeGlobs = (options.include ?? []).map(globToRegExp);
	const excludeGlobs = (options.exclude ?? []).map(globToRegExp);
	const shouldSearch = (rel: string, name: string): boolean => {
		if (excludeGlobs.length > 0 && matchesAnyGlob(rel, excludeGlobs)) {
			return false;
		}
		if (includeGlobs.length > 0) return matchesAnyGlob(rel, includeGlobs);
		return extensions.has(extensionOf(name));
	};

	const hits: ISearchHit[] = [];
	let scanned = 0;
	let truncated = false;

	const visitFile = async (absPath: string): Promise<void> => {
		if (truncated) return;
		let raw: string;
		try {
			const st = await stat(absPath);
			if (!st.isFile() || st.size > MAX_FILE_BYTES) return;
			raw = await readFile(absPath, 'utf8');
		} catch {
			return;
		}
		scanned += 1;
		const rel = relative(workspaceRootAbs, absPath).split(sep).join('/');
		const lines = raw.split('\n');
		for (let i = 0; i < lines.length; i += 1) {
			const line = lines[i] as string;
			if (!matches(line)) continue;
			hits.push({
				file: rel,
				line: i + 1,
				text:
					line.length > MAX_LINE_PREVIEW
						? `${line.slice(0, MAX_LINE_PREVIEW)}…`
						: line,
			});
			if (hits.length >= maxResults) {
				truncated = true;
				return;
			}
		}
	};

	const walk = async (absDir: string): Promise<void> => {
		if (truncated) return;
		const entries = await readdir(absDir, { withFileTypes: true }).catch(
			() => null
		);
		if (entries === null) return;
		// Deterministic order so results are stable across runs.
		const sorted = [...entries].sort((a, b) => a.name.localeCompare(b.name));
		for (const entry of sorted) {
			if (truncated) return;
			if (entry.isDirectory()) {
				if (ignoreDirs.has(entry.name)) continue;
				await walk(join(absDir, entry.name));
			} else if (entry.isFile()) {
				const absPath = join(absDir, entry.name);
				const rel = relative(workspaceRootAbs, absPath).split(sep).join('/');
				if (shouldSearch(rel, entry.name)) {
					await visitFile(absPath);
				}
			}
		}
	};

	for (const root of roots) {
		if (truncated) break;
		const absRoot = join(workspaceRootAbs, root);
		const st = await stat(absRoot).catch(() => null);
		if (st?.isFile()) await visitFile(absRoot);
		else if (st?.isDirectory()) await walk(absRoot);
	}

	return { query, hits, truncated, scanned };
};

import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
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
}

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
export const searchWorkspace = (
	workspaceRootAbs: string,
	query: string,
	options: ISearchOptions = {}
): ISearchResult => {
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
	const needle = caseSensitive ? trimmed : trimmed.toLowerCase();

	const hits: ISearchHit[] = [];
	let scanned = 0;
	let truncated = false;

	const visitFile = (absPath: string): void => {
		if (truncated) return;
		let raw: string;
		try {
			const st = statSync(absPath);
			if (!st.isFile() || st.size > MAX_FILE_BYTES) return;
			raw = readFileSync(absPath, 'utf8');
		} catch {
			return;
		}
		scanned += 1;
		const rel = relative(workspaceRootAbs, absPath).split(sep).join('/');
		const lines = raw.split('\n');
		for (let i = 0; i < lines.length; i += 1) {
			const line = lines[i] as string;
			const haystack = caseSensitive ? line : line.toLowerCase();
			if (!haystack.includes(needle)) continue;
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

	const walk = (absDir: string): void => {
		if (truncated) return;
		let entries;
		try {
			entries = readdirSync(absDir, { withFileTypes: true });
		} catch {
			return;
		}
		// Deterministic order so results are stable across runs.
		const sorted = [...entries].sort((a, b) => a.name.localeCompare(b.name));
		for (const entry of sorted) {
			if (truncated) return;
			if (entry.isDirectory()) {
				if (ignoreDirs.has(entry.name)) continue;
				walk(join(absDir, entry.name));
			} else if (entry.isFile()) {
				if (extensions.has(extensionOf(entry.name))) {
					visitFile(join(absDir, entry.name));
				}
			}
		}
	};

	for (const root of roots) {
		if (truncated) break;
		const absRoot = join(workspaceRootAbs, root);
		if (!existsSync(absRoot)) continue;
		const st = (() => {
			try {
				return statSync(absRoot);
			} catch {
				return null;
			}
		})();
		if (st?.isFile()) visitFile(absRoot);
		else if (st?.isDirectory()) walk(absRoot);
	}

	return { query, hits, truncated, scanned };
};

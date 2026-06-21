import {
	resolveWorkspaceContained,
	walkAllowedFiles,
} from '@mcp-vertex/core/public';
import { execFile } from 'node:child_process';
import { readFile, stat } from 'node:fs/promises';
import { basename, join, relative, resolve, sep } from 'node:path';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

/** One matching line. `file` is relative to the workspace root. */
export interface ISearchHit {
	readonly file: string;
	readonly line: number;
	readonly text: string;
	/** `context` lines immediately before the match, oldest first. Omitted when `context` is 0/unset. */
	readonly before?: readonly string[];
	/** `context` lines immediately after the match. Omitted when `context` is 0/unset. */
	readonly after?: readonly string[];
}

export interface ISearchResult {
	readonly query: string;
	readonly hits: readonly ISearchHit[];
	/** True when the result set was capped at `maxResults`. */
	readonly truncated: boolean;
	readonly scanned: number;
	/** True when the `rg` backend actually ran this search. */
	readonly usedRg: boolean;
	/** Set when `preferRg: true` but `rg` wasn't used (e.g. not on `$PATH`). */
	readonly rgFallbackReason?: string;
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
	/** Skip paths matched by the workspace root's `.gitignore`. Default true. */
	readonly respectGitignore?: boolean;
	/** Lines of context before/after each hit. Default 0, clamped to [0, 10]. */
	readonly context?: number;
	/**
	 * Use the `rg` (ripgrep) binary when it's on `$PATH` instead of the
	 * in-house walker. Opt-in: faster on huge repos, but requires the user
	 * to have it installed. Silently falls back to the in-house walker
	 * (with a `usedRg: false` + `rgFallbackReason` in the result) when
	 * `rg` isn't available.
	 */
	readonly preferRg?: boolean;
}

/** Thrown when `regex: true` and `query` is not a valid regular expression. */
export class InvalidSearchPatternError extends Error {
	constructor(
		readonly pattern: string,
		readonly detail: string,
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

const matchesAnyGlob = (relPath: string, globs: readonly RegExp[]): boolean =>
	globs.some((re) => re.test(relPath));

interface IGitignoreRule {
	readonly re: RegExp;
	readonly negate: boolean;
	readonly dirOnly: boolean;
}

/**
 * Compile one `.gitignore` line into a rule. Approximates real git
 * semantics (good enough for skipping search noise, not a git
 * reimplementation): a pattern with an internal `/` anchors to the
 * workspace root; a bare segment (no `/`) matches at any depth. `**`
 * reuses the same span-matching as `globToRegExp`. `!` negates a
 * previous match; trailing `/` restricts the rule to directories.
 */
const compileGitignoreLine = (rawLine: string): IGitignoreRule | undefined => {
	let line = rawLine.trim();
	if (line.length === 0 || line.startsWith('#')) return undefined;
	const negate = line.startsWith('!');
	if (negate) line = line.slice(1);
	const dirOnly = line.endsWith('/');
	if (dirOnly) line = line.slice(0, -1);
	if (line.length === 0) return undefined;
	const anchored = line.startsWith('/');
	if (anchored) line = line.slice(1);
	const body = globToRegExp(line).source.slice(1, -1); // strip globToRegExp's ^…$
	const pattern = anchored || line.includes('/') ? body : `(?:.*/)?${body}`;
	return { re: new RegExp(`^${pattern}(?:/.*)?$`), negate, dirOnly };
};

/** Parse a `.gitignore` file's text into compiled rules, in file order. */
export const parseGitignore = (raw: string): readonly IGitignoreRule[] =>
	raw
		.split('\n')
		.map(compileGitignoreLine)
		.filter((rule): rule is IGitignoreRule => rule !== undefined);

/**
 * Last-matching-rule-wins, as git does. `isDir` lets directory-only (`/`
 * suffixed) rules skip files. Returns false (not ignored) for an empty
 * rule set, so callers never need to special-case "no .gitignore".
 */
export const isGitignored = (
	relPath: string,
	isDir: boolean,
	rules: readonly IGitignoreRule[],
): boolean => {
	let ignored = false;
	for (const rule of rules) {
		if (rule.dirOnly && !isDir) continue;
		if (rule.re.test(relPath)) ignored = !rule.negate;
	}
	return ignored;
};

const DEFAULT_EXTENSIONS: readonly string[] = [
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

const DEFAULT_IGNORE_DIRS: readonly string[] = [
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

const clampContext = (value: number | undefined): number => {
	if (value === undefined || Number.isNaN(value)) return 0;
	return Math.max(0, Math.min(10, Math.floor(value)));
};

const preview = (line: string): string =>
	line.length > MAX_LINE_PREVIEW
		? `${line.slice(0, MAX_LINE_PREVIEW)}…`
		: line;

/**
 * Live, grep-like textual search over the workspace. Pure over the
 * injected absolute root: walks `roots`, reads allow-listed text files
 * (capped in size), and returns the matching lines (capped in count). No
 * persisted index — cheap and always fresh for the small/medium trees an
 * MCP host serves. mcp-vertex stays agnostic: roots/extensions/ignored
 * dirs are all injectable.
 */
const searchWorkspaceInHouse = async (
	workspaceRootAbs: string,
	query: string,
	options: ISearchOptions = {},
): Promise<ISearchResult> => {
	const trimmed = query.trim();
	const maxResults = clampMaxResults(options.maxResults);
	const context = clampContext(options.context);
	if (trimmed.length === 0) {
		return { query, hits: [], truncated: false, scanned: 0, usedRg: false };
	}

	const roots =
		options.roots && options.roots.length > 0 ? options.roots : ['.'];
	const extensions = new Set(
		(options.extensions && options.extensions.length > 0
			? options.extensions
			: DEFAULT_EXTENSIONS
		).map((e) => e.toLowerCase()),
	);
	const ignoreDirs = new Set(options.ignoreDirs ?? DEFAULT_IGNORE_DIRS);
	const caseSensitive = options.caseSensitive ?? false;
	const gitignoreRules =
		options.respectGitignore === false
			? []
			: parseGitignore(
					await readFile(
						join(workspaceRootAbs, '.gitignore'),
						'utf8',
					).catch(() => ''),
				);

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
		if (
			gitignoreRules.length > 0 &&
			isGitignored(rel, false, gitignoreRules)
		) {
			return false;
		}
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
		// Drop a single trailing empty element from the final newline so it
		// never shows up as a phantom "after" context line.
		const rawLines = raw.split('\n');
		const lines =
			rawLines.length > 0 && rawLines[rawLines.length - 1] === ''
				? rawLines.slice(0, -1)
				: rawLines;
		for (let i = 0; i < lines.length; i += 1) {
			const line = lines[i] as string;
			if (!matches(line)) continue;
			hits.push({
				file: rel,
				line: i + 1,
				text: preview(line),
				...(context > 0
					? {
							before: lines
								.slice(Math.max(0, i - context), i)
								.map(preview),
							after: lines
								.slice(i + 1, i + 1 + context)
								.map(preview),
						}
					: {}),
			});
			if (hits.length >= maxResults) {
				truncated = true;
				return;
			}
		}
	};

	const walk = (rootAbs: string): Promise<void> =>
		walkAllowedFiles({
			workspaceRootAbs,
			rootAbs,
			isTruncated: () => truncated,
			shouldSkipDir: (relDirPath, dirName) => {
				if (ignoreDirs.has(dirName)) return true;
				return (
					gitignoreRules.length > 0 &&
					isGitignored(relDirPath, true, gitignoreRules)
				);
			},
			visitFile: async (absPath) => {
				const name = basename(absPath);
				const rel = relative(workspaceRootAbs, absPath)
					.split(sep)
					.join('/');
				if (shouldSearch(rel, name)) {
					await visitFile(absPath);
				}
			},
		});

	for (const root of roots) {
		if (truncated) break;
		// Containment: a root that escapes the workspace (`..`, absolute) is
		// skipped — a read-only search must not catalog outside what the host exposes.
		const contained = resolveWorkspaceContained(workspaceRootAbs, root);
		if (!contained.ok) continue;
		const absRoot = contained.abs;
		const st = await stat(absRoot).catch(() => null);
		if (st?.isFile()) await visitFile(absRoot);
		else if (st?.isDirectory()) await walk(absRoot);
	}

	return { query, hits, truncated, scanned, usedRg: false };
};

/** Resolve whether the `rg` binary is on `$PATH`. Cheap, no caching — a search is not a hot loop. */
const isRgAvailable = async (): Promise<boolean> => {
	try {
		await execFileAsync('rg', ['--version']);
		return true;
	} catch {
		return false;
	}
};

interface IRgJsonMatchLine {
	readonly type: 'match';
	readonly data: {
		readonly path: { readonly text: string };
		readonly line_number: number;
		readonly lines: { readonly text: string };
		readonly submatches?: readonly unknown[];
	};
}

interface IRgJsonContextLine {
	readonly type: 'context';
	readonly data: {
		readonly path: { readonly text: string };
		readonly line_number: number;
		readonly lines: { readonly text: string };
	};
}

const isRgJsonMatch = (value: unknown): value is IRgJsonMatchLine =>
	typeof value === 'object' &&
	value !== null &&
	(value as { type?: unknown }).type === 'match';

const isRgJsonContext = (value: unknown): value is IRgJsonContextLine =>
	typeof value === 'object' &&
	value !== null &&
	(value as { type?: unknown }).type === 'context';

const stripTrailingNewline = (line: string): string =>
	line.endsWith('\n') ? line.slice(0, -1) : line;

/**
 * `rg --json` backend: shells out to ripgrep with the same containment
 * guard, gitignore handling (rg respects `.gitignore` natively, so
 * `respectGitignore: false` maps to `--no-ignore`) and result cap as the
 * in-house walker, parsing rg's stable JSON Lines protocol (rg ≥ 12.0;
 * only the documented `match`/`context` record fields are read).
 */
const searchWorkspaceWithRg = async (
	workspaceRootAbs: string,
	query: string,
	options: ISearchOptions,
): Promise<ISearchResult> => {
	const trimmed = query.trim();
	const maxResults = clampMaxResults(options.maxResults);
	const context = clampContext(options.context);
	const caseSensitive = options.caseSensitive ?? false;

	const roots = (
		options.roots && options.roots.length > 0 ? options.roots : ['.']
	)
		.map((root) => resolveWorkspaceContained(workspaceRootAbs, root))
		.filter((c) => c.ok)
		.map((c) => c.abs);

	const args: string[] = ['--json', '--line-number'];
	args.push(caseSensitive ? '--case-sensitive' : '--ignore-case');
	if (!options.regex) args.push('--fixed-strings');
	if (options.respectGitignore === false) args.push('--no-ignore');
	for (const dir of options.ignoreDirs ?? DEFAULT_IGNORE_DIRS) {
		args.push('--glob', `!**/${dir}/**`);
	}
	for (const glob of options.include ?? []) args.push('--glob', glob);
	for (const glob of options.exclude ?? []) args.push('--glob', `!${glob}`);
	if (context > 0) args.push('--context', String(context));
	args.push('--max-count', String(maxResults));
	args.push('--', trimmed, ...(roots.length > 0 ? roots : ['.']));

	const { stdout } = await execFileAsync('rg', args, {
		cwd: workspaceRootAbs,
		maxBuffer: 64 * 1024 * 1024,
	}).catch((err: { stdout?: string; code?: number }) => {
		// rg exits 1 (not an error) when there are zero matches.
		if (err.code === 1) return { stdout: err.stdout ?? '' };
		throw err;
	});

	// rg's JSON Lines stream interleaves `context` (before AND after) and
	// `match` records per file in line-number order, e.g. for `--context 2`
	// around a match on line 3: context(1), context(2), match(3),
	// context(4), context(5). Buffering each file's records in stream
	// order and then, per match, walking outward while the neighbour is a
	// `context` record is simpler and strictly correct — no "nearest key"
	// distance heuristic needed, since a context record always belongs to
	// the match record adjacent to it in that same per-file stream.
	interface IRgRecord {
		readonly kind: 'match' | 'context';
		readonly line: number;
		readonly text: string;
	}
	const recordsByFile = new Map<string, IRgRecord[]>();
	const fileOrder: string[] = [];
	const scannedFiles = new Set<string>();

	for (const rawLine of stdout.split('\n')) {
		if (rawLine.length === 0) continue;
		let parsed: unknown;
		try {
			parsed = JSON.parse(rawLine);
		} catch {
			continue;
		}
		const isMatch = isRgJsonMatch(parsed);
		const isContext = isRgJsonContext(parsed);
		if (!isMatch && !(isContext && context > 0)) continue;
		const data = (parsed as IRgJsonMatchLine | IRgJsonContextLine).data;
		const relPath = relative(workspaceRootAbs, resolve(data.path.text))
			.split(sep)
			.join('/');
		scannedFiles.add(relPath);
		if (!recordsByFile.has(relPath)) {
			recordsByFile.set(relPath, []);
			fileOrder.push(relPath);
		}
		recordsByFile.get(relPath)!.push({
			kind: isMatch ? 'match' : 'context',
			line: data.line_number,
			text: preview(stripTrailingNewline(data.lines.text)),
		});
	}

	const hits: ISearchHit[] = [];
	for (const file of fileOrder) {
		const records = [...(recordsByFile.get(file) ?? [])].sort(
			(a, b) => a.line - b.line,
		);
		for (let i = 0; i < records.length; i += 1) {
			const record = records[i] as IRgRecord;
			if (record.kind !== 'match') continue;
			const before: string[] = [];
			for (
				let b = i - 1;
				b >= 0 && records[b]?.kind === 'context';
				b -= 1
			) {
				before.unshift((records[b] as IRgRecord).text);
			}
			const after: string[] = [];
			for (
				let a = i + 1;
				a < records.length && records[a]?.kind === 'context';
				a += 1
			) {
				after.push((records[a] as IRgRecord).text);
			}
			hits.push({
				file,
				line: record.line,
				text: record.text,
				...(context > 0 ? { before, after } : {}),
			});
		}
	}

	const truncated = hits.length > maxResults;
	return {
		query,
		hits: hits.slice(0, maxResults),
		truncated,
		scanned: scannedFiles.size,
		usedRg: true,
	};
};

/**
 * Live, grep-like textual search over the workspace. Dispatches to the
 * `rg` backend when `preferRg: true` AND the binary is on `$PATH`;
 * otherwise (or on any rg failure) falls back to the in-house walker,
 * reporting why via `rgFallbackReason`. Pure over the injected absolute
 * root — agnostic — roots/extensions/ignored dirs are all injectable.
 */
export const searchWorkspace = async (
	workspaceRootAbs: string,
	query: string,
	options: ISearchOptions = {},
): Promise<ISearchResult> => {
	if (query.trim().length === 0) {
		return { query, hits: [], truncated: false, scanned: 0, usedRg: false };
	}
	if (options.preferRg === true) {
		if (await isRgAvailable()) {
			try {
				return await searchWorkspaceWithRg(
					workspaceRootAbs,
					query,
					options,
				);
			} catch (err) {
				if (err instanceof InvalidSearchPatternError) throw err;
				return {
					...(await searchWorkspaceInHouse(
						workspaceRootAbs,
						query,
						options,
					)),
					rgFallbackReason: `rg invocation failed: ${String(err)}`,
				};
			}
		}
		return {
			...(await searchWorkspaceInHouse(workspaceRootAbs, query, options)),
			rgFallbackReason: 'rg binary not found on $PATH',
		};
	}
	return searchWorkspaceInHouse(workspaceRootAbs, query, options);
};

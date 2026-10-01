/**
 * search-engine.in-house.ts — Solid-Strategy implementation.
 *
 * Live, grep-like textual search over the workspace. Pure over the
 * injected absolute root: walks `roots`, reads allow-listed text files
 * (capped in size), returns the matching lines (capped in count). No
 * persisted index — cheap and always fresh for the small/medium trees
 * an MCP host serves. delendai stays agnostic: roots / extensions /
 * ignored dirs are all injectable.
 *
 * Solid-SRP: lives in its own module so the dispatcher (`search-engine
 * .service.ts`) and the rg backend (`search-engine.backends.ts`) can
 * depend on the in-house walker without dragging the whole service
 * file with them. Solid-OCP: any new search backend (e.g. `ag`,
 * `git grep`) is a NEW implementation of `ISearchBackend`, never an
 * edit to this file.
 */
import { basename, relative, sep } from 'node:path';

import { SafeWorkspaceReader, walkAllowedFiles } from '@delendai/core/public';

import {
	DEFAULT_EXTENSIONS,
	DEFAULT_IGNORE_DIRS,
	MAX_FILE_BYTES,
	clampContext,
	clampMaxResults,
	extensionOf,
	matchesAnyGlob,
	preview,
} from './search-engine.constants';
import { isGitignored, parseGitignore } from './search-engine.gitignore';
import { globToRegExp } from './search-engine.glob';
import {
	InvalidSearchPatternError,
	type ISearchBackend,
	type ISearchHit,
	type ISearchResult,
} from './search-engine.types';
import { resolveSearchRoots } from './search-safe-reader';

export { InvalidSearchPatternError } from './search-engine.types';

/** Stable identifier for logs / diagnostics. */
export const IN_HOUSE_BACKEND_ID = 'in-house';

export const createInHouseBackend = async (): Promise<ISearchBackend> => ({
	id: IN_HOUSE_BACKEND_ID,
	// Solid-OCP: the in-house walker needs no external probe — it
	// always runs as long as the file system is reachable.
	isAvailable: async () => true,
	async execute(args): Promise<ISearchResult> {
		const { workspaceRootAbs, query, options } = args;
		const trimmed = query.trim();
		const maxResults = clampMaxResults(options.maxResults);
		const context = clampContext(options.context);
		if (trimmed.length === 0) {
			return {
				query,
				hits: [],
				truncated: false,
				scanned: 0,
				usedRg: false,
			};
		}

		const roots =
			options.roots && options.roots.length > 0 ? options.roots : ['.'];
		// a00062: `extensionOf()` returns a bare, dot-less extension
		// ("ts", not ".ts"), but `delendai.config.json`'s own committed
		// `plugins.search.options.extensions` (and every host's natural
		// authoring instinct, matching `path.extname()`) writes the
		// dot-prefixed form (".ts"). A config-supplied list therefore
		// NEVER matched `extensions.has(extensionOf(name))`, silently
		// returning zero hits for every search on a repo that ever set
		// this option — including this very repo's own config. Stripping
		// a leading dot here makes the comparison tolerant of either
		// spelling instead of requiring hosts to know the internal,
		// undocumented dot-less convention.
		const extensions = new Set(
			(options.extensions && options.extensions.length > 0
				? options.extensions
				: DEFAULT_EXTENSIONS
			).map((e) => e.toLowerCase().replace(/^\./, '')),
		);
		const ignoreDirs = new Set(options.ignoreDirs ?? DEFAULT_IGNORE_DIRS);
		const caseSensitive = options.caseSensitive ?? false;
		const reader = new SafeWorkspaceReader(workspaceRootAbs);
		const gitignoreRules =
			options.respectGitignore === false
				? []
				: parseGitignore(
						await reader
							.readText('.gitignore')
							.then((result) => result.content)
							.catch(() => ''),
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

		// Path filters: include globs REPLACE the extension allow-list;
		// exclude globs always win. Compiled once.
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
			if (includeGlobs.length > 0)
				return matchesAnyGlob(rel, includeGlobs);
			return extensions.has(extensionOf(name));
		};

		const hits: ISearchHit[] = [];
		let scanned = 0;
		let truncated = false;

		const visitFile = async (absPath: string): Promise<void> => {
			if (truncated) return;
			const rel = relative(workspaceRootAbs, absPath)
				.split(sep)
				.join('/');
			let raw: string;
			try {
				const file = await reader.readText(rel);
				const st = file.stats;
				if (!st.isFile() || st.size > MAX_FILE_BYTES) return;
				raw = file.content;
			} catch {
				return;
			}
			scanned += 1;
			// Drop a single trailing empty element from the final newline so
			// it never shows up as a phantom "after" context line.
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

		const rejectedRoots: string[] = [];
		const missingRoots: string[] = [];
		const resolvedRoots = await resolveSearchRoots(reader, roots);
		rejectedRoots.push(...resolvedRoots.rejected);
		missingRoots.push(...resolvedRoots.missing);
		for (const root of resolvedRoots.roots) {
			if (truncated) break;
			if (root.stats.isFile()) await visitFile(root.path.absolutePath);
			else if (root.stats.isDirectory())
				await walk(root.path.absolutePath);
			else missingRoots.push(root.input);
		}

		// a00063: a silent `scanned: 0` sent a real agent into a
		// zero-result retry spiral (124 identical empty searches,
		// absolute roots at other repos, blind file probing). When the
		// walk touched NOTHING, say why — the usual cause is a config
		// whose `roots` describe a different project's layout.
		let diagnostic: string | undefined;
		if (scanned === 0) {
			const parts: string[] = [];
			if (missingRoots.length > 0) {
				parts.push(
					`configured roots do not exist in this workspace: ${missingRoots.join(', ')}`,
				);
			}
			if (rejectedRoots.length > 0) {
				parts.push(
					`roots must stay inside the workspace (rejected: ${rejectedRoots.join(', ')})`,
				);
			}
			if (parts.length === 0) {
				parts.push(
					`0 files matched the filters under roots [${roots.join(', ')}] — check plugins.search.options (extensions/include/exclude) in delendai.config.json`,
				);
			}
			diagnostic = `scanned 0 files: ${parts.join('; ')}. Fix plugins.search.options.roots in delendai.config.json (omit roots to scan the whole workspace).`;
		}

		return {
			query,
			hits,
			truncated,
			scanned,
			usedRg: false,
			...(diagnostic !== undefined ? { diagnostic } : {}),
		};
	},
});

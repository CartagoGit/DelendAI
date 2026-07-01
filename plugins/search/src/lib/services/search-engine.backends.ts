/**
 * search-engine.backends.ts — Solid Strategy + OCP extraction.
 *
 * `searchWorkspace()` previously had two complete search algorithms
 * (the in-house walker and the `rg --json` backend) inlined in a
 * single function with a `if (preferRg)` branch at the top. That mixed
 * four responsibilities:
 *
 *   1. The in-house walker (read file, regex match, context lines).
 *   2. The `rg` backend (CLI invocation + JSON-Lines parser).
 *   3. The "is `rg` available?" probe.
 *   4. The fallback decision tree.
 *
 * After this split:
 *
 *   - **OCP** (`ISearchBackend`): adding a new backend (e.g. `ag`,
 *     `git grep`, an LSP indexer) is a NEW implementation, no edit to
 *     `searchWorkspace`. The dispatcher picks from the registered
 *     list at construction time.
 *   - **SRP**: each backend owns exactly one algorithm. The
 *     `in-house` backend lives in `search-engine.in-house.ts`, the
 *     `rg` backend lives here.
 *   - **DIP**: callers depend on `ISearchBackend`, never on the
 *     concrete `rg` shell-out.
 *
 * The dispatcher lives in `search-engine.service.ts`; this module is
 * the Strategy *implementations* only.
 */
import { execFile } from 'node:child_process';
import { relative, resolve, sep } from 'node:path';
import { promisify } from 'node:util';

import { resolveWorkspaceContained } from '@mcp-vertex/core/public';

import {
	DEFAULT_IGNORE_DIRS,
	clampContext,
	clampMaxResults,
	preview,
} from './search-engine.constants';
import type {
	ISearchBackend,
	ISearchHit,
	ISearchResult,
} from './search-engine.types';

export type {
	ISearchBackend,
	ISearchHit,
	ISearchOptions,
	ISearchResult,
} from './search-engine.types';

const execFileAsync = promisify(execFile);

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

/** Stable identifier for logs / diagnostics — never localised. */
export const RG_BACKEND_ID = 'rg';

/**
 * Solid-OCP: probe `rg` once per search (cheap — `execFile rg --version`).
 * Exposed so the dispatcher can decide whether to actually wire the
 * `rg` backend into the chain; tests inject a custom probe to avoid
 * a real subprocess.
 */
export type IRgAvailableProbe = () => Promise<boolean>;

/** Default probe: spawn `rg --version` once. */
export const defaultRgAvailableProbe: IRgAvailableProbe = async () => {
	try {
		await execFileAsync('rg', ['--version']);
		return true;
	} catch {
		return false;
	}
};

/**
 * `rg --json` backend (Solid-Strategy implementation).
 *
 * Solid-OCP: lives behind `ISearchBackend` so swapping it for `ag` /
 * `git grep` / a custom indexer never touches the dispatcher or the
 * tool registration.
 */
export const createRgBackend = async (
	options: { readonly rgAvailable?: IRgAvailableProbe } = {},
): Promise<ISearchBackend> => {
	const probe = options.rgAvailable ?? defaultRgAvailableProbe;
	return {
		id: RG_BACKEND_ID,
		isAvailable: probe,
		async execute(call): Promise<ISearchResult> {
			const { workspaceRootAbs, query, options: opts } = call;
			const trimmed = query.trim();
			const maxResults = clampMaxResults(opts.maxResults);
			const context = clampContext(opts.context);
			const caseSensitive = opts.caseSensitive ?? false;

			const roots = (
				opts.roots && opts.roots.length > 0 ? opts.roots : ['.']
			)
				.map((root) =>
					resolveWorkspaceContained(workspaceRootAbs, root),
				)
				.filter((c) => c.ok)
				.map((c) => c.abs);

			const rgArgs: string[] = ['--json', '--line-number'];
			rgArgs.push(caseSensitive ? '--case-sensitive' : '--ignore-case');
			if (!opts.regex) rgArgs.push('--fixed-strings');
			if (opts.respectGitignore === false) rgArgs.push('--no-ignore');
			for (const dir of opts.ignoreDirs ?? DEFAULT_IGNORE_DIRS) {
				rgArgs.push('--glob', `!**/${dir}/**`);
			}
			for (const glob of opts.include ?? []) rgArgs.push('--glob', glob);
			for (const glob of opts.exclude ?? [])
				rgArgs.push('--glob', `!${glob}`);
			if (context > 0) rgArgs.push('--context', String(context));
			rgArgs.push('--max-count', String(maxResults));
			rgArgs.push('--', trimmed, ...(roots.length > 0 ? roots : ['.']));

			const { stdout } = await execFileAsync('rg', rgArgs, {
				cwd: workspaceRootAbs,
				maxBuffer: 64 * 1024 * 1024,
			}).catch((err: { stdout?: string; code?: number }) => {
				// rg exits 1 (not an error) when there are zero matches.
				if (err.code === 1) return { stdout: err.stdout ?? '' };
				throw err;
			});

			// rg's JSON Lines stream interleaves `context` (before AND after)
			// and `match` records per file in line-number order. Buffer per
			// file, then per match walk outward while the neighbour is
			// `context` — strictly correct, no nearest-key heuristic.
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
				const data = (parsed as IRgJsonMatchLine | IRgJsonContextLine)
					.data;
				const relPath = relative(
					workspaceRootAbs,
					resolve(data.path.text),
				)
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
		},
	};
};

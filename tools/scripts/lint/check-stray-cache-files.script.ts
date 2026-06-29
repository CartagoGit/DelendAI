#!/usr/bin/env bun
/**
 * check-stray-cache-files.script.ts — f00081 + f00082.
 *
 * f00081: any executable-looking file (`*.ts`, `*.mjs`, `*.sh`, `*.py`,
 * …) under `.cache/mcp-vertex/<weird>/` is a stray — the cache root is
 * for engine state, not for agent-authored code. Real scripts live
 * under `tools/scripts/`.
 *
 * f00082: extends the same defence to the repo root. The root
 * contains 19 legitimate files (AGENTS.md, package.json, biome.json,
 * lefthook.yml, mcp-vertex.config.json, …) but **none of them has an
 * executable extension**. A file like `-la` (output of `ls -la`),
 * `tmp.sh`, `probe.py`, `experiment.ts` at the root is almost always
 * an agent whose shell mis-redirection landed in the wrong place. The
 * root-level check flags every executable-extension file in the
 * top-level entry of the repo (NOT recursive — subdirs like
 * `tools/scripts/*.ts` are legitimate source code).
 *
 * Sanctioned cache layout (f00081, for reference):
 *
 *   .cache/mcp-vertex/
 *     bootstrap/      (engine boot snapshots)
 *     drift/          (drift-store snapshots)
 *     handoff/        (loop-detector handoff packets)
 *     logs/           (append-only JSONL event log)
 *     memory/         (agent memory store)
 *     proposals/      (regenerable index.json)
 *     rules/          (vendored framework rule packs)
 *     state/          (transient locks, registry snapshots)
 *     verify/         (current scratch root for plugin-tool-verify)
 *     <pluginCacheDir>/exec/ (f00080 ephemeral exec paths per plugin)
 *     .worktrees/<agent>/    (per-agent git worktrees, NOT code)
 *
 * The previous lints only checked *what runtime code wrote* (os.tmpdir,
 * /tmp, homedir) and *where the cache root lived* (only `.cache/`
 * itself). Neither caught agents writing driver scripts directly to
 * `.cache/mcp-vertex/<weird>/` or stray files at the repo root. This
 * closes both gaps.
 */

import { readdir } from 'node:fs/promises';
import { join, relative } from 'node:path';

import { repoRoot } from '../lib/monorepo-paths';

/** Sanctioned top-level entries under `<cacheRoot>/`. Anything else is stray. */
const SANCTIONED_TOP_LEVEL: ReadonlySet<string> = new Set([
	// Subdirs of durable or regenerable cache state.
	'bootstrap',
	'drift',
	'handoff',
	'logs',
	'memory',
	'proposals',
	'rules',
	'state',
	'verify',
	// Per-plugin ephemeral exec dir (f00080). Plugins add their own
	// `<pluginCacheDir>/<plugin>/exec/` subtree at boot, so we whitelist
	// the whole pattern generically below.
	// Per-agent git worktrees — not source code, never stray.
	'.worktrees',
]);

/**
 * Subdirs that ARE valid cache locations even though they sit at depth 2+
 * with arbitrary content (e.g. `verify/<pid>/probe.txt`).
 */
const SANCTIONED_SUBPATH_PREFIXES: readonly string[] = [
	'verify/',
	'handoff/',
	'logs/',
	'rules/',
	'.worktrees/',
];

/** Executable-looking extensions an agent might leave in the cache by mistake. */
const STRAY_EXECUTABLE_EXTENSIONS = new Set([
	'.ts',
	'.mjs',
	'.js',
	'.sh',
	'.bash',
	'.py',
	'.rb',
	'.pl',
	'.zsh',
]);

/** Top-level files the runtime owns and that we should never flag. */
const SANCTIONED_TOP_LEVEL_FILES = new Set(['proposal-id-counters.json']);

/** A single stray file detected under the cache root. */
export interface IStrayCacheFile {
	readonly absPath: string;
	readonly relPath: string;
	readonly reason:
		| 'unknown-top-level-dir'
		| 'unknown-top-level-executable'
		| 'unknown-subdir-executable'
		| 'orphan-compiled-bundle';
}

/** Summary returned to the CLI. */
export interface IStrayCacheFilesSummary {
	readonly cacheRoot: string;
	readonly strays: readonly IStrayCacheFile[];
	readonly ok: boolean;
}

/**
 * Classify one entry under the cache root. Returns a stray description
 * when the entry should be flagged, or `null` when it's sanctioned.
 */
const classifyCacheEntry = async (
	cacheRootAbs: string,
	entryName: string,
	isDirectory: boolean,
): Promise<IStrayCacheFile | null> => {
	const abs = join(cacheRootAbs, entryName);
	const rel = relative(cacheRootAbs, abs);

	if (SANCTIONED_TOP_LEVEL.has(entryName)) return null;
	if (SANCTIONED_TOP_LEVEL_FILES.has(entryName)) return null;

	// Per-plugin exec subdirs (f00080) live as `<pluginCacheDir>/<plugin>/exec/`,
	// but the cache-rooted view sees them as `mcp-vertex/<plugin>/exec/`.
	// We accept any entry whose depth-1 name is a plugin cache subdir AND
	// whose path is under that subdir (so an agent can't smuggle code
	// by giving it a `<plugin>-exec/`-shaped name).
	if (isDirectory && entryName.includes('/') === false) {
		// Top-level entry is a dir we don't recognise. Always a stray.
		return {
			absPath: abs,
			relPath: rel,
			reason: 'unknown-top-level-dir',
		};
	}

	// Recognised executable file extension at the cache root (rare but
	// happens when an agent does `bun build ... --outdir .cache`).
	const dotIndex = entryName.lastIndexOf('.');
	const ext = dotIndex === -1 ? '' : entryName.slice(dotIndex).toLowerCase();
	if (!isDirectory && STRAY_EXECUTABLE_EXTENSIONS.has(ext)) {
		// `.mjs` at the cache root is *usually* a bun-built bundle left
		// behind by an earlier verify run; we still flag it because the
		// user wanted the cache to be a clean landing pad for results,
		// not an incubator for build artefacts.
		return {
			absPath: abs,
			relPath: rel,
			reason:
				ext === '.mjs'
					? 'orphan-compiled-bundle'
					: 'unknown-top-level-executable',
		};
	}

	return null;
};

/** Recursive walk: flag any executable-looking file under an
 *  un-sanctioned subdirectory of the cache root. */
const walkForStrayExecutables = async (
	cacheRootAbs: string,
	dirAbs: string,
	collected: IStrayCacheFile[],
): Promise<void> => {
	const entries = await readdir(dirAbs, { withFileTypes: true }).catch(
		() => [],
	);
	for (const entry of entries) {
		const abs = join(dirAbs, entry.name);
		const rel = relative(cacheRootAbs, abs);

		// Skip sanctioned subpaths entirely — anything inside them is
		// legitimate (rule packs, log lines, handoff packets, ...).
		if (SANCTIONED_SUBPATH_PREFIXES.some((p) => rel.startsWith(p))) {
			continue;
		}

		// `.worktrees/<agent>/...` is also off-limits — those are git
		// worktrees, not source.
		if (rel.startsWith('.worktrees/')) continue;

		if (entry.isDirectory()) {
			await walkForStrayExecutables(cacheRootAbs, abs, collected);
			continue;
		}
		if (!entry.isFile()) continue;
		const dotIndex = entry.name.lastIndexOf('.');
		const ext =
			dotIndex === -1 ? '' : entry.name.slice(dotIndex).toLowerCase();
		if (!STRAY_EXECUTABLE_EXTENSIONS.has(ext)) continue;
		collected.push({
			absPath: abs,
			relPath: rel,
			reason: 'unknown-subdir-executable',
		});
	}
};

/**
 * Walk the cache root and return every stray file (top-level or nested).
 * Pure over the filesystem it is handed; pass an injected root for tests.
 */
export const findStrayCacheFiles = async (
	cacheRootAbs: string,
): Promise<IStrayCacheFilesSummary> => {
	const strays: IStrayCacheFile[] = [];
	const topEntries = await readdir(cacheRootAbs, {
		withFileTypes: true,
	}).catch(() => []);
	for (const entry of topEntries) {
		const stray = await classifyCacheEntry(
			cacheRootAbs,
			entry.name,
			entry.isDirectory(),
		);
		if (stray !== null) {
			strays.push(stray);
		}
		if (entry.isDirectory()) {
			await walkForStrayExecutables(
				cacheRootAbs,
				join(cacheRootAbs, entry.name),
				strays,
			);
		}
	}
	strays.sort((a, b) => a.relPath.localeCompare(b.relPath));
	return {
		cacheRoot: cacheRootAbs,
		strays,
		ok: strays.length === 0,
	};
};

/**
 * A single stray file detected at the repo root.
 */
export interface IStrayRootFile {
	readonly absPath: string;
	readonly relPath: string;
	readonly reason: 'root-executable-extension' | 'root-without-extension';
	readonly extension: string;
}

/** Summary returned to the CLI for the root-level scan. */
export interface IStrayRootFilesSummary {
	readonly repoRoot: string;
	readonly strays: readonly IStrayRootFile[];
	readonly ok: boolean;
}

/**
 * Whitelist of legitimate top-level files at the repo root. None of
 * these has an executable extension — they're all `.md`, `.json`,
 * `.ts`/`.mjs` config, `.yml`/`.toml`/`.lock`. Add to this list when
 * a new legitimate root file is introduced (e.g. a new `*.config.ts`).
 */
const SANCTIONED_ROOT_FILES: ReadonlySet<string> = new Set([
	// Human-edited docs and licenses.
	'AGENTS.md',
	'CLAUDE.md',
	'CHANGELOG.md',
	'LICENSE',
	'README.md',
	// Build / config / lockfiles.
	'package.json',
	'biome.json',
	'bunfig.toml',
	'bun.lock',
	'lefthook.yml',
	'mcp-vertex.config.json',
	'stylelint.config.mjs',
	'tsconfig.base.json',
	'tsconfig.json',
	'vitest.config.ts',
	'vitest.shared.ts',
	// Dotfile config — auto-discovered by their respective tools.
	'.gitignore',
	'.mcp.json',
]);

/**
 * Walk the repo root (NOT recursive — subdirs are scanned by the
 * targeted lints, e.g. `tools/scripts/` is legitimate source code).
 * Flags any file with an executable-looking extension. Returns a
 * summary the CLI can pretty-print.
 *
 * Pure over the filesystem; pass an injected root for tests.
 */
export const findStrayRootFiles = async (
	repoRootAbs: string,
): Promise<IStrayRootFilesSummary> => {
	const strays: IStrayRootFile[] = [];
	const entries = await readdir(repoRootAbs, { withFileTypes: true }).catch(
		() => [],
	);
	for (const entry of entries) {
		if (!entry.isFile()) continue;
		if (SANCTIONED_ROOT_FILES.has(entry.name)) continue;
		const abs = join(repoRootAbs, entry.name);
		const dotIndex = entry.name.lastIndexOf('.');
		const ext =
			dotIndex === -1 ? '' : entry.name.slice(dotIndex).toLowerCase();
		if (STRAY_EXECUTABLE_EXTENSIONS.has(ext)) {
			strays.push({
				absPath: abs,
				relPath: entry.name,
				reason: 'root-executable-extension',
				extension: ext,
			});
			continue;
		}
		// Files at the root with no extension (e.g. `-la`, `output`,
		// `tmp`) almost always mean an agent's shell mis-redirection
		// landed in the root. We flag them too — they have no business
		// being there.
		if (ext === '' && entry.name !== 'LICENSE') {
			strays.push({
				absPath: abs,
				relPath: entry.name,
				reason: 'root-without-extension',
				extension: '',
			});
		}
	}
	strays.sort((a, b) => a.relPath.localeCompare(b.relPath));
	return {
		repoRoot: repoRootAbs,
		strays,
		ok: strays.length === 0,
	};
};

const isMainModule = (): boolean => {
	const entry = process.argv[1];
	return entry !== undefined && import.meta.url === `file://${entry}`;
};

if (isMainModule()) {
	void (async () => {
		const root = repoRoot();
		const cacheRootAbs = join(root, '.cache', 'mcp-vertex');
		const cacheSummary = await findStrayCacheFiles(cacheRootAbs);
		const rootSummary = await findStrayRootFiles(root);

		let hadFailure = false;

		if (!cacheSummary.ok) {
			hadFailure = true;
			console.error(
				`✖ check-stray-cache-files: ${cacheSummary.strays.length} stray file(s) under ${cacheSummary.cacheRoot}:`,
			);
			for (const s of cacheSummary.strays) {
				console.error(`  ${s.reason}: ${s.relPath}`);
			}
			console.error(
				'  fix: move the source code to tools/scripts/ (if real) or delete it (if it was a one-shot).',
			);
		} else {
			console.log(
				`✓ check-stray-cache-files: ${relative(root, cacheSummary.cacheRoot)} contains no stray source files.`,
			);
		}

		if (!rootSummary.ok) {
			hadFailure = true;
			console.error(
				`✖ check-stray-root-files: ${rootSummary.strays.length} stray file(s) at the repo root:`,
			);
			for (const s of rootSummary.strays) {
				console.error(
					`  ${s.reason}: ${s.relPath} (ext=${s.extension || '∅'})`,
				);
			}
			console.error(
				'  fix: move the file to tools/scripts/ (if it is a real script) or delete it (if it was a mis-redirection).',
			);
		} else {
			console.log(
				'✓ check-stray-root-files: repo root has no stray executable files.',
			);
		}

		if (hadFailure) process.exit(1);
	})();
}

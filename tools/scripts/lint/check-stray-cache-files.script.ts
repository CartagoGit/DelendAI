#!/usr/bin/env bun
/**
 * check-stray-cache-files.script.ts — f00081 (the "scripts dropped in the
 * wrong place" lint). The repo's cache root is `.cache/mcp-vertex/` and
 * every artefact under it is meant to fall into a sanctioned subdir:
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
 * Anything ELSE under `.cache/mcp-vertex/` that looks like source
 * (`*.ts`, `*.mjs`, `*.js`, `*.sh`, `*.py`, `*.mjs` with shebang) or is
 * a top-level entry that is neither a sanctioned subdir nor a known
 * cache artefact is a stray — it almost always means an agent wrote
 * source code into the cache root because the shell cwd was wrong or
 * the convention was unknown. The lint fails loudly so the operator
 * can either move the file to `tools/scripts/` (real driver code) or
 * delete it (one-shot artefact).
 *
 * The previous lints only checked *what runtime code wrote* (os.tmpdir,
 * /tmp, homedir) and *where the cache root lived* (only `.cache/`
 * itself). Neither caught agents writing driver scripts directly to
 * `.cache/mcp-vertex/<weird>/`. This closes that gap.
 */

import { readdir, stat } from 'node:fs/promises';
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

const isMainModule = (): boolean => {
	const entry = process.argv[1];
	return entry !== undefined && import.meta.url === `file://${entry}`;
};

if (isMainModule()) {
	void (async () => {
		const root = repoRoot();
		// Mirrors `cacheRoot()` in tools/scripts/lib/monorepo-paths.ts —
		// kept duplicated rather than imported so this script can also
		// run from a tool-context where monorepo-paths.ts may not be on
		// the require path.
		const cacheRootAbs = join(root, '.cache', 'mcp-vertex');
		const summary = await findStrayCacheFiles(cacheRootAbs);
		if (!summary.ok) {
			console.error(
				`✖ check-stray-cache-files: ${summary.strays.length} stray file(s) under ${summary.cacheRoot}:`,
			);
			for (const s of summary.strays) {
				console.error(`  ${s.reason}: ${s.relPath}`);
			}
			console.error(
				'  fix: move the source code to tools/scripts/ (if real) or delete it (if it was a one-shot).',
			);
			process.exit(1);
			return;
		}
		console.log(
			`✓ check-stray-cache-files: ${relative(root, summary.cacheRoot)} contains no stray source files.`,
		);
	})();
}

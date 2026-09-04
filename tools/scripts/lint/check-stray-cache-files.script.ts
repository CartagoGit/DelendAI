#!/usr/bin/env bun
/**
 * check-stray-cache-files.script.ts — f00081 + f00082.
 *
 * f00081: any executable-looking file (`*.ts`, `*.mjs`, `*.sh`, `*.py`,
 * …) under `.cache/delendai/<weird>/` is a stray — the cache root is
 * for engine state, not for agent-authored code. Real scripts live
 * under `tools/scripts/`.
 *
 * f00082: extends the same defence to the repo root. The root
 * contains 19 legitimate files (AGENTS.md, package.json, biome.json,
 * lefthook.yml, delendai.config.json, …) but **none of them has an
 * executable extension**. A file like `-la` (output of `ls -la`),
 * `tmp.sh`, `probe.py`, `experiment.ts` at the root is almost always
 * an agent whose shell mis-redirection landed in the wrong place. The
 * root-level check flags every executable-extension file in the
 * top-level entry of the repo (NOT recursive — subdirs like
 * `tools/scripts/*.ts` are legitimate source code).
 *
 * Sanctioned cache layout (f00081, for reference):
 *
 *   .cache/delendai/
 *     bootstrap/      (engine boot snapshots — derivable, safe to delete)
 *     drift/          (drift-store snapshots — derivable, safe to delete)
 *     proposals/      (regenerable index.json — derivable, safe to delete)
 *     rules/          (vendored framework rule packs — derivable)
 *     state/          (transient locks, registry snapshots — safe to delete)
 *     verify/         (current scratch root for plugin-tool-verify)
 *     handoff/        (loop-detector handoff packets — transient)
 *     results/        (user-flagged 2026-07-17: accumulated RECORDS, not
 *                      derivable cache — deleting these loses real
 *                      information, unlike everything else above)
 *       logs/            (append-only JSONL event log — every outcome)
 *       logs-errors/     (curated JSONL error stream — outcome != ok/idle
 *                         only, full context; see plugins/logs)
 *       memory/          (agent memory store)
 *       usage-tracking/  (accrued spend/usage history)
 *     evidence/       (typed runtime evidence, partitioned by evidence type)
 *     <pluginCacheDir>/exec/ (f00080 ephemeral exec paths per plugin)
 *     .worktrees/<agent>/    (per-agent git worktrees, NOT code)
 *
 * The previous lints only checked *what runtime code wrote* (os.tmpdir,
 * /tmp, homedir) and *where the cache root lived* (only `.cache/`
 * itself). Neither caught agents writing driver scripts directly to
 * `.cache/delendai/<weird>/` or stray files at the repo root. This
 * closes both gaps.
 */

import { readdir, stat } from 'node:fs/promises';
import { join, relative } from 'node:path';

import { repoRoot } from '../lib/monorepo-paths';

/** Sanctioned top-level entries under `<cacheRoot>/`. Anything else is stray. */
const SANCTIONED_TOP_LEVEL: ReadonlySet<string> = new Set([
	// Subdirs of durable or regenerable cache state.
	'bootstrap',
	'drift',
	'exec',
	'evidence',
	'handoff',
	'logs-errors',
	'proposals',
	'rules',
	'runtime',
	'skills',
	'state',
	'verify',
	// Persistent swarm task queue (default-path-layout.constant.ts:
	// taskQueueDir = <cacheDir>/agent-queue). Runtime-owned, never stray.
	'agent-queue',
	// Accumulated records (see IMcpPlugin#cacheNamespace) — NOT derivable
	// cache, but still under the one canonical ignored root. Nests
	// logs/memory/usage-tracking (and any future opt-in plugin).
	'results',
	// Per-plugin ephemeral exec dir (f00080)
	// Per-agent git worktrees — not source code, never stray.
	'.worktrees',
]);

/**
 * Subdirs that ARE valid cache locations even though they sit at depth 2+
 * with arbitrary content (e.g. `verify/<pid>/probe.txt`).
 */
const SANCTIONED_SUBPATH_PREFIXES: readonly string[] = [
	'verify/',
	'evidence/',
	'handoff/',
	'results/logs/',
	'results/logs-errors/',
	'results/memory/',
	'results/usage-tracking/',
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

const STALE_AGENTS_LOCK_TMP_MS = 60_000;
const STALE_TMP_MS = 60_000;

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
		| 'orphan-compiled-bundle'
		| 'stale-agents-lock-tmp'
		| 'stale-zero-byte-tmp';
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
	pluginNames: ReadonlySet<string>,
): Promise<IStrayCacheFile | null> => {
	const abs = join(cacheRootAbs, entryName);
	const rel = relative(cacheRootAbs, abs);
	if (
		!isDirectory &&
		entryName.startsWith('agents.lock.json.') &&
		entryName.endsWith('.tmp')
	) {
		const info = await stat(abs).catch(() => null);
		if (
			info !== null &&
			Date.now() - info.mtimeMs > STALE_AGENTS_LOCK_TMP_MS
		) {
			return {
				absPath: abs,
				relPath: rel,
				reason: 'stale-agents-lock-tmp',
			};
		}
	}

	if (SANCTIONED_TOP_LEVEL.has(entryName)) return null;
	if (SANCTIONED_TOP_LEVEL_FILES.has(entryName)) return null;
	// x00105: `<cacheDir>/<plugin>/` is the documented pluginCacheDir
	// contract (IMcpPluginContext) — every plugin that exists under
	// `plugins/*` may own a cache dir named after itself. Derived from
	// disk, never a hardcoded list.
	if (isDirectory && pluginNames.has(entryName)) return null;

	// Per-plugin exec subdirs (f00080) live as `<pluginCacheDir>/<plugin>/exec/`,
	// but the cache-rooted view sees them as `delendai/<plugin>/exec/`.
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
 * a00072 S7.a: walk the cache root and flag any `.tmp` file that is
 * 0 bytes AND has mtime older than `STALE_TMP_MS` (60s). A 0-byte
 * tmp is almost always a crashed write — the atomic-rename pattern
 * leaves a stable-named file at the canonical path and a `.tmp` next
 * to it only when the rename failed. Reporting these as FATAL kills
 * the `usage-tracking` symptom where every validate-stamp leaves a
 * dead `summary.json.tmp` stuck behind.
 */
const walkForZeroByteTmpFiles = async (
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
		if (entry.isDirectory()) {
			// Recurse into the usage-tracking cache dir (the known
			// hotspot) and any other sanctioned subdir that ends in
			// `.tmp` siblings — the walker is read-only and safe.
			await walkForZeroByteTmpFiles(cacheRootAbs, abs, collected);
			continue;
		}
		if (!entry.isFile()) continue;
		if (!entry.name.endsWith('.tmp')) continue;
		const info = await stat(abs).catch(() => null);
		if (info === null) continue;
		// S7.a: only 0-byte AND stale tmp files are FATAL. A non-empty
		// tmp is mid-write; a fresh 0-byte tmp is just-spawned. Anything
		// older than 60s with size 0 means a crash mid-write.
		if (info.size !== 0) continue;
		if (Date.now() - info.mtimeMs < STALE_TMP_MS) continue;
		collected.push({
			absPath: abs,
			relPath: rel,
			reason: 'stale-zero-byte-tmp',
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
	// Legit plugin cache dir names come from the plugins/ tree on disk.
	const pluginDirs = await readdir(join(repoRoot(), 'plugins'), {
		withFileTypes: true,
	}).catch(() => []);
	const pluginNames: ReadonlySet<string> = new Set(
		pluginDirs
			.filter((entry) => entry.isDirectory())
			.map((entry) => entry.name),
	);
	const topEntries = await readdir(cacheRootAbs, {
		withFileTypes: true,
	}).catch(() => []);
	for (const entry of topEntries) {
		const stray = await classifyCacheEntry(
			cacheRootAbs,
			entry.name,
			entry.isDirectory(),
			pluginNames,
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
			// a00072 S7.a: also scan for 0-byte stale tmp files
			// anywhere under the cache root (>60s old).
			await walkForZeroByteTmpFiles(
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
	readonly reason:
		| 'root-executable-extension'
		| 'root-without-extension'
		| 'root-untracked-directory';
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
	'delendai.config.json',
	'stylelint.config.mjs',
	'tsconfig.base.json',
	'tsconfig.json',
	'vitest.config.ts',
	'vitest.shared.ts',
	// Dotfile config — auto-discovered by their respective tools.
	'.gitignore',
	'.mcp.json',
	// Tracked placeholder file — no extension on purpose. Originally a
	// scratch sentinel for the proposals registry that the workspace
	// tools leave in place; tracked in git (empty blob) so `git status`
	// stays clean across worktrees that share `.cache/`.
	'proposals',
]);

/**
 * Walk the repo root (NOT recursive — subdirs are scanned by the
 * targeted lints, e.g. `tools/scripts/` is legitimate source code).
 * Flags any file with an executable-looking extension. Returns a
 * summary the CLI can pretty-print.
 *
 * Pure over the filesystem; pass an injected root for tests.
 */
/**
 * Top-level directories git can see but that nothing tracks or ignores.
 *
 * The file-level checks below are not recursive, so a scratch DIRECTORY
 * slips straight past them: `.scratch-repro/noderes.mjs` is one level
 * down and was invisible to every gate. That matters more here than in
 * most repos, because commit-policy sweeps the whole dirty worktree on
 * a timer — an agent's throwaway repro directory is one sweep away from
 * being committed and pushed by somebody else's commit.
 *
 * Asking git is what makes this self-maintaining: anything tracked is by
 * definition legitimate, anything ignored was a deliberate decision, and
 * what is left is precisely the set that a sweep would pick up. No
 * hardcoded allowlist to drift out of date.
 *
 * Temporary files belong in the agent harness's own scratchpad, outside
 * the repository entirely — not in the root, and not in
 * `.cache/delendai/`, which is reserved for engine and plugin state.
 */
const findUntrackedRootDirectories = async (
	repoRootAbs: string,
): Promise<readonly string[]> => {
	const { execFile } = await import('node:child_process');
	const { promisify } = await import('node:util');
	const run = promisify(execFile);
	let stdout = '';
	try {
		({ stdout } = await run(
			'git',
			['status', '--porcelain', '--untracked-files=normal'],
			{ cwd: repoRootAbs, maxBuffer: 16 * 1024 * 1024 },
		));
	} catch {
		// Not a git repo, or git unavailable: this check contributes
		// nothing rather than failing the gate for an unrelated reason.
		return [];
	}
	return (
		stdout
			.split('\n')
			.filter((line) => line.startsWith('?? '))
			.map((line) => line.slice(3).trim())
			// `git status` reports an untracked DIRECTORY with a trailing
			// slash and does not descend into it.
			.filter(
				(path) =>
					path.endsWith('/') && !path.slice(0, -1).includes('/'),
			)
			.map((path) => path.slice(0, -1))
	);
};

export const findStrayRootFiles = async (
	repoRootAbs: string,
): Promise<IStrayRootFilesSummary> => {
	const strays: IStrayRootFile[] = [];
	for (const name of await findUntrackedRootDirectories(repoRootAbs)) {
		strays.push({
			absPath: join(repoRootAbs, name),
			relPath: `${name}/`,
			reason: 'root-untracked-directory',
			extension: '',
		});
	}
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
		const cacheRootAbs = join(root, '.cache', 'delendai');
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
			if (
				rootSummary.strays.some(
					(stray) => stray.reason === 'root-untracked-directory',
				)
			) {
				console.error(
					'  fix (directory): scratch and repro directories go in the agent',
				);
				console.error(
					'    harness scratchpad, OUTSIDE the repository — not the repo root and',
				);
				console.error(
					'    not .cache/delendai/, which is reserved for engine and plugin',
				);
				console.error(
					'    state. commit-policy sweeps the whole dirty worktree on a timer, so',
				);
				console.error(
					'    anything left here can be committed and pushed by another agent',
				);
				console.error(
					'    before you delete it. If the directory IS part of the project, track',
				);
				console.error(
					'    it; if it is generated, add it to .gitignore.',
				);
			}
			if (
				rootSummary.strays.some(
					(stray) => stray.reason !== 'root-untracked-directory',
				)
			) {
				console.error(
					'  fix (file): move it to tools/scripts/ (if it is a real script) or delete it (if it was a mis-redirection).',
				);
			}
		} else {
			console.log(
				'✓ check-stray-root-files: repo root has no stray executable files.',
			);
		}

		if (hadFailure) process.exit(1);
	})();
}

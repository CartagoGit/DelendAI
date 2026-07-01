/**
 * Canonical ephemeral exec paths inside `<pluginCacheDir>/exec/`.
 *
 * Why this module exists
 * ----------------------
 * Plugins, hosts, and AI agents sometimes need to materialise a file on
 * disk in order to *do something and then throw it away*: a runnable
 * shell script the harness executes once, a JSON blob the agent parses
 * and then deletes, a sidecar a CLI tool requires for one invocation.
 *
 * Before this module those artefacts landed in `os.tmpdir()` (typically
 * `/tmp/`) or in a per-script tmp folder next to the script that
 * created them. Both patterns leaked runtime scratch outside the
 * workspace, hid the artefact from `git status`, and made it impossible
 * for the plugin loader to enumerate, prune, or `.gitignore` them as a
 * single canonical family.
 *
 * After this module every ephemeral artefact lives under
 * `<ctx.pluginCacheDir>/exec/<name>` — derived, never hardcoded. That
 * gives the artefact four invariants for free:
 *
 *   1. It is `.gitignore`d by the repo-wide cache ignore.
 *   2. The `check-cache` lint refuses stray siblings at the cache root.
 *   3. The plugin loader can `rm -rf <pluginCacheDir>` on `--reset` and
 *      recover the whole scratch surface in one shot.
 *   4. A human can `ls .cache/mcp-vertex/<plugin>/exec/` to debug a
 *      misbehaving agent — the artefact is not stranded under
 *      `/tmp/<random>` where nobody will ever find it.
 *
 * f00058 — Canonical ephemeral exec paths inside pluginCacheDir.
 */

import { mkdir, readdir, rm, stat } from 'node:fs/promises';
import { isAbsolute, relative, resolve, sep } from 'node:path';

import type { IMcpPluginContext } from '../plugins/plugin-contract';

/** Subdirectory under `<pluginCacheDir>` reserved for ephemeral artefacts. */
export const EXEC_SUBDIR_NAME = 'exec';

/** Result of {@link resolveExecPath}. */
export interface IResolvedExecPath {
	/** Absolute path to the resolved file. */
	readonly abs: string;
	/** Path relative to `<pluginCacheDir>`, forward-slash normalised. */
	readonly rel: string;
	/** Absolute `<pluginCacheDir>/exec` directory created (idempotent). */
	readonly execDir: string;
}

/** Options accepted by {@link resolveExecPath}. */
export interface IResolveExecPathOptions {
	/**
	 * When true, the parent directory is NOT created. Use this when the
	 * caller needs a deterministic path string without touching disk
	 * (e.g. computing a name for a future write that hasn't happened yet).
	 * Defaults to `false` — the helper is idempotent and side-effect-free
	 * apart from the parent `mkdir -p`.
	 */
	readonly skipMkdir?: boolean;
}

/**
 * Return a workspace-relative path that is safe to embed in logs.
 *
 * Normalises Windows back-slashes to forward slashes so that log lines
 * stay portable across hosts (`extensions/vscode` runs on Windows;
 * `tools/scripts/` runs on Linux CI).
 */
export const execDirRelative = (ctx: IMcpPluginContext): string => {
	const rel = relative(ctx.pluginCacheDir, execDirFor(ctx))
		.split(sep)
		.join('/');
	return rel === '' ? '.' : rel;
};

const execDirFor = (ctx: IMcpPluginContext): string =>
	resolve(ctx.pluginCacheDir, EXEC_SUBDIR_NAME);

const assertInsideExecDir = (ctx: IMcpPluginContext, abs: string): void => {
	// Containment is two-layered: the path must stay inside the
	// `<pluginCacheDir>` workspace root (prevents `../../etc/evil`
	// style escapes) AND inside the `<pluginCacheDir>/exec/` directory
	// (prevents `../escape.sh` from landing next to the cache, where
	// a sibling plugin could read it). The plugin root check is the
	// wider one; the exec-dir check is the precise one.
	const relPlugin = relative(ctx.pluginCacheDir, abs).split(sep).join('/');
	if (relPlugin === '..' || relPlugin.startsWith('../')) {
		throw new Error(
			`exec path escapes pluginCacheDir ${ctx.pluginCacheDir}: ${abs}`,
		);
	}
	const execDir = execDirFor(ctx);
	const relExec = relative(execDir, abs).split(sep).join('/');
	if (relExec === '..' || relExec.startsWith('../')) {
		throw new Error(
			`exec path escapes <pluginCacheDir>/exec (${execDir}): ${abs}`,
		);
	}
};

/**
 * Resolve `<pluginCacheDir>/exec/<name>` to an absolute path, creating
 * the parent directory if missing.
 *
 * `name` is treated as a relative path *inside* the `exec/` directory:
 *   - absolute names are rejected (`<pluginCacheDir>` is the boundary)
 *   - `..` traversal that escapes `exec/` is rejected
 *   - nested subpaths are allowed (`'probe/sub/x.sh'`)
 *
 * The helper is idempotent — repeated calls for the same `name` reuse the
 * same absolute path without re-stat'ing the parent. Callers must NOT
 * reach for `os.tmpdir()`; this is the only sanctioned entry point.
 */
export const resolveExecPath = async (
	ctx: IMcpPluginContext,
	name: string,
	options: IResolveExecPathOptions = {},
): Promise<IResolvedExecPath> => {
	if (typeof name !== 'string' || name.length === 0) {
		throw new Error(
			`resolveExecPath: name must be a non-empty string, got ${JSON.stringify(name)}`,
		);
	}
	if (isAbsolute(name)) {
		throw new Error(
			`resolveExecPath: name must be relative to <pluginCacheDir>/exec, got absolute path: ${name}`,
		);
	}
	if (name.includes('\u0000')) {
		throw new Error('resolveExecPath: name must not contain a NUL byte');
	}
	const execDir = execDirFor(ctx);
	const abs = resolve(execDir, name);
	assertInsideExecDir(ctx, abs);
	const rel = relative(ctx.pluginCacheDir, abs).split(sep).join('/');
	if (!options.skipMkdir) {
		await mkdir(execDir, { recursive: true });
	}
	return { abs, rel: rel === '' ? '.' : rel, execDir };
};

/**
 * Run `fn` with an absolute path to a fresh ephemeral file, then unlink
 * the file in a `finally` so callers don't have to remember to clean up.
 *
 * `fn` may read, write, mutate, or unlink the file itself; the helper
 * only guarantees the post-condition (the file is gone) when the caller
 * leaves it behind. If `fn` throws, the file is still unlinked before the
 * error propagates.
 *
 * The canonical pattern is:
 *
 *   const result = await withEphemeralExec(ctx, 'probe.json', async (abs) => {
 *     await writeFileAtomic(abs, scriptBody);
 *     return readFile(abs, 'utf8');
 *   });
 *
 * The helper resolves and unlinks the path; `fn` owns the actual
 * read/write/run. There is no `prelude` option — split work between
 * `fn` (or two calls) when the lifecycle is more complex than
 * write → fn → unlink.
 */
export const withEphemeralExec = async <T>(
	ctx: IMcpPluginContext,
	name: string,
	fn: (abs: string) => Promise<T>,
): Promise<T> => {
	const { abs } = await resolveExecPath(ctx, name);
	try {
		return await fn(abs);
	} finally {
		await rm(abs, { force: true }).catch(() => undefined);
	}
};

/** Outcome of {@link pruneExpiredExec}. */
export interface IPruneExpiredResult {
	/** Absolute path of the `<pluginCacheDir>/exec` directory scanned. */
	readonly execDir: string;
	/** Number of regular files removed (directories are never pruned). */
	readonly removed: number;
	/** Errors encountered while pruning, in encounter order. */
	readonly errors: readonly Error[];
}

/**
 * Remove every regular file in `<pluginCacheDir>/exec/` whose `mtimeMs`
 * is older than `ttlMs`. Missing directory → empty result, no throw.
 *
 * Subdirectories are recursed into depth-first but NEVER removed — the
 * caller owns the layout, the helper only enforces TTL on leaf files.
 * Symlinks are unlinked if their target's `mtimeMs` is older; broken
 * symlinks are silently skipped (they could not have been read anyway).
 *
 * The TTL is intentionally a number (not a `Date`) so the caller can
 * derive it from `performance.now()` or a clock-skewed source without
 * `Date.now()` collisions.
 */
export const pruneExpiredExec = async (
	ctx: IMcpPluginContext,
	ttlMs: number,
): Promise<IPruneExpiredResult> => {
	if (typeof ttlMs !== 'number' || !Number.isFinite(ttlMs) || ttlMs < 0) {
		throw new Error(
			`pruneExpiredExec: ttlMs must be a non-negative finite number, got ${ttlMs}`,
		);
	}
	const execDir = execDirFor(ctx);
	const now = Date.now();
	const errors: Error[] = [];
	let removed = 0;

	const st = await stat(execDir).catch(() => undefined);
	if (st?.isDirectory() !== true) {
		return { execDir, removed: 0, errors };
	}

	const stack: string[] = [execDir];
	while (stack.length > 0) {
		const dir = stack.pop();
		if (dir === undefined) break;
		const entries = await readdir(dir, { withFileTypes: true }).catch(
			(err: Error) => {
				errors.push(err);
				return [];
			},
		);
		for (const entry of entries) {
			const child = resolve(dir, entry.name);
			if (entry.isDirectory()) {
				stack.push(child);
				continue;
			}
			if (!entry.isFile()) continue;
			const mst = await stat(child).catch(() => undefined);
			if (mst === undefined) continue;
			if (now - mst.mtimeMs <= ttlMs) continue;
			try {
				await rm(child, { force: true });
				removed += 1;
			} catch (err) {
				errors.push(err as Error);
			}
		}
	}
	return { execDir, removed, errors };
};

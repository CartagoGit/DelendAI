/**
 * verify-tmp-root.ts — single source of truth for the three lock specs'
 * ephemeral scratch root.
 *
 * Why this exists (commit 75f896bc follow-up, 2026-08-01):
 * The original `makeVerifyTmpDir` helper used `process.cwd()` as the root
 * for `<cwd>/.cache/delendai/verify-tmp/<prefix>-XXXXXX/`. That works
 * when the suite runs from the repo root, but when the suite runs from
 * an isolated agent worktree (the swarm pattern: `bun --cwd`
 * + `.worktrees/agent-<id>/`), `process.cwd()` resolves to the
 * worktree, and the spec writes a `.cache/delendai/` dir **inside**
 * the worktree. The `check-cache` lint only sees the tracked tree, so
 * the leak is invisible to the gate until someone opens the worktree
 * in their IDE.
 *
 * The fix: walk up from `import.meta.url` until we find the
 * repo-root marker (`AGENTS.md` is the only universal file in every
 * delendai checkout). The cache root is then
 * `<repoRoot>/.cache/delendai/verify-tmp/`, regardless of cwd.
 *
 * Why not `import { cacheRoot } from 'tools/scripts/lib/monorepo-paths'`?
 * That would couple a plugin spec to a tools-scripts module — a
 * downward dependency that the layer rules forbid. This helper is
 * strictly local to the lock specs and reproduces the same root
 * derivation in 14 lines.
 *
 * Why not `process.cwd()` + sandbox hint? Because the bug is exactly
 * that `process.cwd()` is the wrong source of truth under isolation.
 * The delendai.monorepo has exactly one canonical cache root, and
 * the import-meta walk is the smallest reliable way to find it from
 * anywhere in the source tree (worktree, hoisted checkout, etc.).
 */

import { existsSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Workspace-marker file that exists at the repo root in every
 * delendai checkout. Picked over `package.json` because the root
 * `package.json` is the workspace root marker for the build system,
 * but a future republished single-package snapshot would still ship
 * `AGENTS.md` while collapsing the workspace root.
 */
const REPO_MARKER = 'AGENTS.md';

/**
 * Walk up from a starting directory until we find a directory that
 * contains `AGENTS.md`. Returns the path of that directory, or
 * `undefined` if the walk reaches the filesystem root without a hit.
 *
 * The walk is bounded by `MAX_WALK_DEPTH` (8) so a corrupted
 * workspace cannot spin forever; delendai is shallow enough (root
 * + 1–2 levels of `packages/` / `plugins/`) that 8 is plenty.
 */
const findRepoRoot = (startDir: string): string | undefined => {
	const MAX_WALK_DEPTH = 8;
	let current = startDir;
	for (let depth = 0; depth < MAX_WALK_DEPTH; depth += 1) {
		if (existsSync(join(current, REPO_MARKER))) return current;
		const parent = dirname(current);
		if (parent === current) return undefined;
		current = parent;
	}
	return undefined;
};

/**
 * Cache-relative path inside the canonical cache root.
 * Matches `DEFAULT_CORE_PATHS.cacheDir` (see
 * `packages/core/src/lib/contracts/interfaces/core-paths.interface.ts`).
 */
const CACHE_DIR_REL = '.cache/delendai';

/**
 * Resolve the cache root from `import.meta.url`: walks up to the
 * repo root, then joins the canonical cache dir. Result is absolute
 * and stable across cwd / worktree / hoisted-checkout invocations.
 *
 * NOTE: Each spec file imports this helper separately and uses
 * `import.meta.url` at its own call site. That is intentional —
 * importing from a shared `.ts` module would resolve the URL from
 * THIS file (the helper), which is also inside the repo tree, so the
 * walk still terminates at the correct root. We do not need to
 * thread the URL in from the call site.
 */
const resolveCacheRoot = (): string => {
	const here = dirname(fileURLToPath(import.meta.url));
	const repoRoot = findRepoRoot(here);
	if (repoRoot === undefined) {
		// Fallback: spec ran from a path that does not have AGENTS.md
		// above it (e.g. a published tarball). Fall back to cwd so the
		// test still runs; the leak will be local to the cwd, which is
		// the best we can do when the repo root is not locatable.
		return join(process.cwd(), CACHE_DIR_REL);
	}
	return join(repoRoot, CACHE_DIR_REL);
};

/**
 * Returns the canonical ephemeral test scratch root for the three
 * lock specs: `<repoRoot>/.cache/delendai/verify-tmp/`. Created on
 * disk on first call so `mkdtempSync` has a parent to play in.
 *
 * The returned path is absolute and stable across callers.
 */
export const verifyTmpRoot = (): string => {
	// Nests under the already-sanctioned `verify/` top-level cache dir
	// (see `check-stray-cache-files.script.ts`'s `SANCTIONED_TOP_LEVEL` /
	// `SANCTIONED_SUBPATH_PREFIXES`) instead of inventing a new
	// `verify-tmp` top-level name the stray-cache-files gate doesn't
	// recognise.
	const root = join(resolveCacheRoot(), 'verify', 'lock-specs');
	mkdirSync(root, { recursive: true });
	return root;
};

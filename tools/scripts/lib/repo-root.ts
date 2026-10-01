#!/usr/bin/env bun
/**
 * repo-root.ts — `repoRoot()`, split out of `monorepo-paths.ts` so that
 * resolving the worktree root costs nothing but `node:child_process`.
 *
 * Why this is its own module
 * --------------------------
 * `monorepo-paths.ts` is the single source of truth for the monorepo
 * layout (see its header — that convention still stands, and nothing
 * here weakens it: `monorepo-paths` re-exports `repoRoot`, so every
 * existing importer keeps working and no caller has to learn a second
 * place to look). But `monorepo-paths` also derives the cache directory
 * from `DEFAULT_CORE_PATHS`, which it imports from the
 * `@delendai/core/public` barrel — and that barrel transitively pulls
 * in `create-mcp-project.ts` and therefore `@modelcontextprotocol/sdk`.
 *
 * That made a *runtime npm dependency* out of "which directory am I in",
 * which is how `develop-protection-live` broke: the job checks out and
 * installs Bun but deliberately runs no `bun install` (a governance
 * guard that asks GitHub for the live branch rule needs a checkout, not
 * a dependency graph), so `branch-protection-guard.script.ts` — whose
 * only use of `monorepo-paths` was `repoRoot()` — died on
 * `Cannot find module '@modelcontextprotocol/sdk/server/mcp.js'`.
 *
 * The alternative fix — adding `bun install --frozen-lockfile` to that
 * job — would have worked, but it makes a governance check that must be
 * able to run in the leanest possible environment depend on the whole
 * workspace installing cleanly. A guard that can only run when the
 * repository is healthy is worth less precisely when it is needed most.
 *
 * So: leaf module, zero workspace imports, no npm dependencies.
 */
import { spawnSync } from 'node:child_process';
import { sep } from 'node:path';

/**
 * Resolve the repo root from `git rev-parse --show-toplevel`. Honours the
 * current working directory, so linked worktrees report their own toplevel
 * instead of the main worktree's path.
 *
 * The fallback (using `import.meta.url`) is for environments where git
 * is not on PATH or where the script is run outside a checkout (e.g. a
 * downloaded single-file bundle).
 */
export const repoRoot = (): string => {
	try {
		const r = spawnSync('git', ['rev-parse', '--show-toplevel'], {
			cwd: process.cwd(),
			encoding: 'utf8',
		});
		if (r.status === 0) {
			const out = (r.stdout ?? '').trim();
			if (out.length > 0) return out;
		}
	} catch {
		// fall through
	}
	// Fallback: derive from the script's own location. Works for the main
	// worktree; will resolve to the main worktree even from a linked one.
	const here = new URL(import.meta.url);
	const path = `${here.protocol === 'file:' ? '' : ''}${here.pathname}`;
	const segments = path.split(sep).filter((s) => s.length > 0);
	// tools/scripts/lib/repo-root.ts → repo root is 4 levels up
	const tail = segments.slice(0, -4);
	return sep + tail.join(sep);
};

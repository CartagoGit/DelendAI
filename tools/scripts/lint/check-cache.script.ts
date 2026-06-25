#!/usr/bin/env bun
/**
 * check-cache.script.ts — f00065 S2 (single canonical cache gate).
 *
 * The repo has exactly ONE cache root: the workspace root `.cache/`
 * (canonically `<repo-root>/.cache/mcp-vertex`, resolved through
 * `monorepo-paths.ts#cacheRoot`). There is NO per-folder, per-app, or
 * per-package cache. A `.cache` directory anywhere other than the repo root is
 * a regression: some tool or runtime was launched with the wrong cwd/workspace
 * and materialized scratch state in the wrong place (e.g. the historical
 * `tools/scripts/.cache/` from the rules plugin).
 *
 * This script walks the tracked tree and fails if it finds a `.cache`
 * directory outside the root, so the "cache is always the root cache"
 * invariant is enforced for every AI and contributor.
 *
 * Scope:
 *   - Skips `node_modules`, `.git`, `dist`, `build`, `.worktrees`, and the
 *     canonical root `.cache` itself.
 *
 * Exit codes:
 *   0 — only the root `.cache` exists.
 *   1 — one or more stray `.cache` directories exist outside the root.
 */
import { readdir, stat } from 'node:fs/promises';
import { join, relative } from 'node:path';
import { repoRoot } from '../lib/monorepo-paths';

const SKIP_DIRS: ReadonlySet<string> = new Set([
	'node_modules',
	'.git',
	'dist',
	'build',
	'.worktrees',
]);

/**
 * Walk `dir` (absolute) and collect every workspace-relative path of a
 * `.cache` directory that is NOT the canonical root `.cache`. Pure over the
 * filesystem it is handed; returns sorted relative paths.
 */
export const findStrayCacheDirs = async (
	root: string,
	dir: string = root,
): Promise<string[]> => {
	const entries = await readdir(dir).catch(() => []);
	const stray: string[] = [];
	for (const entry of entries) {
		if (SKIP_DIRS.has(entry)) continue;
		const abs = join(dir, entry);
		const st = await stat(abs).catch(() => undefined);
		if (st?.isDirectory() !== true) continue;
		const rel = relative(root, abs);
		if (entry === '.cache') {
			// The single allowed cache is the root `.cache` (rel === '.cache').
			if (rel !== '.cache') stray.push(rel);
			// Never descend into any `.cache` (root or stray): its contents are
			// generated scratch, not source to audit.
			continue;
		}
		stray.push(...(await findStrayCacheDirs(root, abs)));
	}
	return stray.sort((a, b) => a.localeCompare(b));
};

const isMainModule = (): boolean => {
	const entry = process.argv[1];
	return entry !== undefined && import.meta.url === `file://${entry}`;
};

if (isMainModule()) {
	void (async () => {
		const root = repoRoot();
		const stray = await findStrayCacheDirs(root);
		if (stray.length > 0) {
			console.error(
				`✖ check-cache: ${stray.length} stray .cache director${
					stray.length === 1 ? 'y' : 'ies'
				} outside the canonical root .cache/:`,
			);
			for (const rel of stray) console.error(`  ${rel}`);
			console.error(
				'  Cache is ALWAYS the root .cache/mcp-vertex/ — never per-folder. ' +
					'Delete the stray dir and re-run the offending tool from the repo root.',
			);
			process.exit(1);
			return;
		}
		console.log(
			'✓ check-cache: the only .cache is the canonical root .cache/.',
		);
	})();
}

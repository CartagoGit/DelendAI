#!/usr/bin/env bun
/**
 * sync-public-api.ts — keep `apps/web/public/api/` pointing at
 * `build/docs-api/` so Astro (both `dev` and `build`) serves the typedoc
 * output under `/api/` without forcing typedoc to live inside `apps/web/`.
 *
 * Behaviour
 * ---------
 * - If `apps/web/public/api/` already exists as the right symlink, this is
 *   a no-op.
 * - If it exists as a real directory (legacy layout, pre p126 convention),
 *   it is moved aside to `apps/web/public/api.legacy-<ts>/` (one-shot).
 *   This preserves the data so it can be diffed or removed manually.
 * - Otherwise the symlink is created RELATIVE to the target so it survives
 *   being checked out at any depth:
 *
 *       apps/web/public/api  ->  ../../../build/docs-api
 *
 * Idempotent. Safe to run before every `astro dev` / `astro build`.
 */
import {
	existsSync,
	lstatSync,
	mkdirSync,
	readlinkSync,
	renameSync,
	symlinkSync,
	unlinkSync,
} from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// Derive the repo root from `git rev-parse --show-toplevel` rather than
// `import.meta.url`. The latter resolves the file's real path, which is the
// main worktree path even when the script is run from a linked worktree
// (e.g. `~/worktrees/foo/apps/web/`). `git rev-parse` honours the current
// working directory and gives us the actual toplevel of the worktree the
// user is on.
const REPO_ROOT = (() => {
	try {
		const r = Bun.spawnSync(['git', 'rev-parse', '--show-toplevel'], {
			cwd: process.cwd(),
		});
		if (r.exitCode === 0) {
			const out = new TextDecoder().decode(r.stdout).trim();
			if (out.length > 0) return out;
		}
	} catch {
		// Fall through to the import.meta.url-based heuristic.
	}
	const here = dirname(fileURLToPath(import.meta.url));
	return resolve(here, '..', '..', '..');
})();

const LINK = join(REPO_ROOT, 'apps', 'web', 'public', 'api');
const TARGET = join(REPO_ROOT, 'build', 'docs-api');

// `path.relative` returns paths like `../../../foo` even when both ends
// share a common ancestor (the repo root here). That extra `../` lands
// OUTSIDE the repo when followed from the symlink. We compute the relative
// path manually: climb from `dirname(LINK)` up to `REPO_ROOT`, then descend
// into `TARGET` (which is already relative to `REPO_ROOT`).
const computeRelTarget = (linkAbs: string, targetAbs: string): string => {
	const linkDir = dirname(linkAbs);
	const linkParts = linkDir.split(SEPARATOR).filter((p) => p.length > 0);
	const rootParts = REPO_ROOT.split(SEPARATOR).filter((p) => p.length > 0);
	// Climb from linkDir up to (and including) REPO_ROOT.
	const climb = linkParts.length - rootParts.length;
	const targetRelToRoot = relative(REPO_ROOT, targetAbs);
	if (climb <= 0) {
		return targetRelToRoot;
	}
	return `${'..' + SEPARATOR}`.repeat(climb) + targetRelToRoot;
};
const SEPARATOR = '/';
const relTarget = computeRelTarget(LINK, TARGET);

const isDir = (p: string): boolean => {
	try {
		return lstatSync(p).isDirectory();
	} catch {
		return false;
	}
};

const isSymlinkToTarget = (p: string, want: string): boolean => {
	try {
		const s = lstatSync(p);
		if (!s.isSymbolicLink()) return false;
		const actualRaw = readlinkSync(p);
		const wantRel = computeRelTarget(p, want);
		return (
			actualRaw === wantRel || actualRaw === resolve(dirname(p), wantRel)
		);
	} catch {
		return false;
	}
};

const main = (): void => {
	mkdirSync(dirname(LINK), { recursive: true });
	mkdirSync(TARGET, { recursive: true });

	if (existsSync(LINK)) {
		if (isSymlinkToTarget(LINK, TARGET)) {
			console.log(`✓ ${LINK} -> ${relTarget} (already in place)`);
			return;
		}
		if (isDir(LINK)) {
			const stamp = new Date().toISOString().replace(/[:.]/g, '-');
			const moved = join(
				REPO_ROOT,
				'apps',
				'web',
				'public',
				`api.legacy-${stamp}`,
			);
			renameSync(LINK, moved);
			console.warn(
				`! ${LINK} was a real directory (legacy). Moved to ${moved}. ` +
					`Creating the symlink now.`,
			);
		} else {
			unlinkSync(LINK);
		}
	}

	symlinkSync(relTarget, LINK, 'dir');
	console.log(`✓ ${LINK} -> ${relTarget}`);
};

main();

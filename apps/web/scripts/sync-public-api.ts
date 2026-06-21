#!/usr/bin/env bun
/**
 * sync-public-api.ts — keep `apps/web/public/api/` pointing at
 * `build/docs-api/` so Astro (both `dev` and `build`) serves the typedoc
 * output under `/api/` without forcing typedoc to live inside `apps/web/`.
 *
 * Behaviour
 * ─────────
 * - If `apps/web/public/api/` already exists as a real directory with files
 *   (legacy layout, pre p126 convention), it is moved aside to
 *   `apps/web/public/api.legacy-<ts>/` (one-shot). This preserves the data
 *   so it can be diffed or removed manually.
 * - If `apps/web/public/api/` already exists as the right symlink, this is
 *   a no-op.
 * - Otherwise, the symlink is created relative to the target so it survives
 *   being checked out at any depth:
 *
 *       apps/web/public/api  →  ../../../build/docs-api
 *
 * The symlink is RELATIVE on purpose: it travels with the repo, so `git
 * clone && bun install` works from any absolute path.
 *
 * Idempotent. Safe to run before every `astro dev` / `astro build`.
 */
import {
	existsSync,
	lstatSync,
	mkdirSync,
	renameSync,
	symlinkSync,
} from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(HERE, '..', '..', '..');
const LINK = join(REPO_ROOT, 'apps', 'web', 'public', 'api');
const TARGET = join(REPO_ROOT, 'build', 'docs-api');

const relTarget = relative(dirname(LINK), TARGET);

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
		const actual = relative(
			dirname(p),
			resolve(dirname(p), readlinkQuick(p)),
		);
		return actual === relative(dirname(p), resolve(want));
	} catch {
		return false;
	}
};

const readlinkQuick = (p: string): string => {
	const { readlinkSync } = require('node:fs') as typeof import('node:fs');
	return readlinkSync(p);
};

const main = (): void => {
	mkdirSync(dirname(LINK), { recursive: true });
	mkdirSync(TARGET, { recursive: true });

	if (existsSync(LINK)) {
		if (isSymlinkToTarget(LINK, TARGET)) {
			console.log(`✓ ${LINK} → ${relTarget} (already in place)`);
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
					`Create the symlink now.`,
			);
		} else {
			// Stray file/symlink to something else: remove and recreate.
			const { unlinkSync } =
				require('node:fs') as typeof import('node:fs');
			unlinkSync(LINK);
		}
	}

	symlinkSync(relTarget, LINK, 'dir');
	console.log(`✓ ${LINK} → ${relTarget}`);
};

main();

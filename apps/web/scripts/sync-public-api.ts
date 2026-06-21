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
			resolve(dirname(p), readlinkSync(p)),
		);
		const wantRel = relative(dirname(p), resolve(want));
		return actual === wantRel;
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

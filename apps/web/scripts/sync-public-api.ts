#!/usr/bin/env bun
/**
 * sync-public-api.ts — keep `apps/web/public/api/` pointing at
 * `build/docs-api/` so Astro (both `dev` and `build`) serves the typedoc
 * output under `/api/` without forcing typedoc to live inside `apps/web/`.
 *
 * Behaviour
 * ---------
 * - If the link already points at the right target, this is a no-op.
 * - If it exists as a real directory (legacy layout, pre p126 convention),
 *   it is moved aside to `apps/web/public/api.legacy-<ts>/` (one-shot).
 *   This preserves the data so it can be diffed or removed manually.
 * - Otherwise the symlink is created RELATIVE to the target so it survives
 *   being checked out at any depth:
 *
 *       apps/web/public/api  ->  ../../build/docs-api
 *
 * Idempotent. Safe to run before every `astro dev` / `astro build`.
 *
 * All path math is delegated to `tools/scripts/lib/monorepo-paths.ts`,
 * the single source of truth for the monorepo build / dist layout. Do
 * NOT hard-code paths here — if you need a new path, add a helper to
 * that module.
 */
import {
	lstatSync,
	mkdirSync,
	readlinkSync,
	renameSync,
	symlinkSync,
	unlinkSync,
} from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import {
	WELL_KNOWN,
	relativeFrom,
	repoRoot,
} from '../../../tools/scripts/lib/monorepo-paths.ts';

const LINK = join(repoRoot(), 'apps', 'web', 'public', 'api');
const TARGET_ABS = WELL_KNOWN.docsApi();

const relTarget = relativeFrom(LINK, TARGET_ABS);

/**
 * Replace Bun's `existsSync` (which can lie about dangling or
 * just-resolved symlinks by reporting false when lstat sees them). A
 * direct lstat-then-catch is the only reliable way to check whether
 * a path slot is occupied.
 */
const pathExists = (p: string): boolean => {
	try {
		lstatSync(p);
		return true;
	} catch {
		return false;
	}
};

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
		// Accept the relative form, the absolute form, or anything that
		// resolves to the same target.
		return (
			actualRaw === relTarget ||
			actualRaw === want ||
			resolve(dirname(p), actualRaw) === want
		);
	} catch {
		return false;
	}
};

const main = (): void => {
	mkdirSync(dirname(LINK), { recursive: true });
	mkdirSync(TARGET_ABS, { recursive: true });

	if (pathExists(LINK)) {
		if (isSymlinkToTarget(LINK, TARGET_ABS)) {
			console.log(`✓ ${LINK} -> ${relTarget} (already in place)`);
			return;
		}
		if (isDir(LINK)) {
			const stamp = new Date().toISOString().replace(/[:.]/g, '-');
			const moved = join(
				repoRoot(),
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

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
 * x00980 S3 (G50, D33): the link is not enough. After linking, the API docs
 * must exist (`index.html`) and be at least as new as the newest package
 * source. A missing or older copy is regenerated with `bun run docs:api`;
 * if it is still missing or older afterwards the script exits non-zero, so
 * dev, preview and build never serve an empty or stale /api.
 *
 * Idempotent. Safe to run before every `astro dev` / `astro build`.
 *
 * All path math is delegated to `tools/scripts/lib/monorepo-paths.ts`,
 * the single source of truth for the monorepo build / dist layout. Do
 * NOT hard-code paths here — if you need a new path, add a helper to
 * that module.
 */
import { spawnSync } from 'node:child_process';
import {
	lstatSync,
	mkdirSync,
	readdirSync,
	statSync,
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

const isSymlinkToTarget = (
	p: string,
	want: string,
	relTarget: string,
): boolean => {
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

/** Newest mtime (ms) of any .ts file under `dir`; 0 when there is none. */
export const newestSourceMtime = (dir: string): number => {
	let newest = 0;
	for (const e of readdirSync(dir, { withFileTypes: true })) {
		if (e.name === 'node_modules' || e.name === 'dist') continue;
		const p = join(dir, e.name);
		const t = e.isDirectory()
			? newestSourceMtime(p)
			: e.name.endsWith('.ts')
				? statSync(p).mtimeMs
				: 0;
		if (t > newest) newest = t;
	}
	return newest;
};

/** Why the API docs cannot be served, or null when they are present and current. */
export const apiDocsProblem = (
	indexMtimeMs: number | null,
	sourceMtimeMs: number,
): string | null => {
	if (indexMtimeMs === null) return 'API docs are missing (no index.html)';
	if (indexMtimeMs < sourceMtimeMs) return 'API docs are older than the code';
	return null;
};

/** Newest .ts mtime across every `packages/<name>/src`. */
export const packagesSrcNewest = (packagesDir: string): number =>
	Math.max(
		0,
		...readdirSync(packagesDir).map((n) => {
			try {
				return newestSourceMtime(join(packagesDir, n, 'src'));
			} catch {
				return 0;
			}
		}),
	);

export const indexMtime = (docsDir: string): number | null => {
	try {
		return statSync(join(docsDir, 'index.html')).mtimeMs;
	} catch {
		return null;
	}
};

/**
 * Returns null when the docs are current; otherwise regenerates once via
 * `regenerate` and returns the remaining problem (null when it fixed it).
 */
export const ensureFreshApiDocs = (
	docsDir: string,
	packagesDir: string,
	regenerate: () => void,
): string | null => {
	const src = packagesSrcNewest(packagesDir);
	const first = apiDocsProblem(indexMtime(docsDir), src);
	if (first === null) return null;
	console.warn(`! ${first}; running \`bun run docs:api\``);
	regenerate();
	return apiDocsProblem(indexMtime(docsDir), src);
};

export const syncLink = (link: string, targetAbs: string): void => {
	const relTarget = relativeFrom(link, targetAbs);
	mkdirSync(dirname(link), { recursive: true });
	mkdirSync(targetAbs, { recursive: true });

	if (pathExists(link)) {
		if (isSymlinkToTarget(link, targetAbs, relTarget)) {
			console.log(`✓ ${link} -> ${relTarget} (already in place)`);
			return;
		}
		if (isDir(link)) {
			const stamp = new Date().toISOString().replace(/[:.]/g, '-');
			const moved = join(dirname(link), `api.legacy-${stamp}`);
			renameSync(link, moved);
			console.warn(
				`! ${link} was a real directory (legacy). Moved to ${moved}. ` +
					`Creating the symlink now.`,
			);
		} else {
			unlinkSync(link);
		}
	}

	symlinkSync(relTarget, link, 'dir');
	console.log(`✓ ${link} -> ${relTarget}`);
};

if (import.meta.main) {
	syncLink(LINK, TARGET_ABS);
	const problem = ensureFreshApiDocs(
		TARGET_ABS,
		join(repoRoot(), 'packages'),
		() => {
			spawnSync('bun', ['run', 'docs:api'], {
				cwd: repoRoot(),
				stdio: 'inherit',
			});
		},
	);
	if (problem !== null) {
		console.error(
			`✗ ${problem} even after \`bun run docs:api\` (${TARGET_ABS})`,
		);
		process.exit(1);
	}
}

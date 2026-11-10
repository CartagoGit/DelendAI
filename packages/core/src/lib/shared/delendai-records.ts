/**
 * delendai-records.ts — the one folder delendai keeps its records in.
 *
 * The migration journal, the applied-configuration record, the cache
 * layout record, the project profile, migration manifests and backups,
 * and the commit driver's lock used to live in `.delendai/` at the
 * workspace root: a second home beside the configured cache directory.
 * They live in `<cacheDir>/records/` now.
 *
 * Why the old folder existed: these records must survive the cache being
 * moved (a changed `cacheDir`, a layout migration), because they are how
 * the move is noticed. Inside the cache, they move with it; what tells
 * where the cache was is the cache directory last applied, remembered in
 * the clone's git directory, which no cache move touches and which is not
 * part of the project tree. Without a git directory, or before anything
 * was remembered, the configured cache directory is used.
 *
 * Synchronous on purpose: identity, the guard and the policy readers ask
 * for these records inline.
 */
import {
	existsSync,
	mkdirSync,
	readFileSync,
	statSync,
	writeFileSync,
} from 'node:fs';
import { isAbsolute, join, resolve } from 'node:path';

import { parse as parseJsonc } from 'jsonc-parser';

import {
	CACHE_DIR_POINTER,
	DEFAULT_CACHE_DIR,
	LEGACY_RECORDS_DIR,
	RECORDS_DIR,
} from '../contracts/constants/delendai-records.constant';

const readText = (path: string): string | undefined => {
	try {
		return readFileSync(path, 'utf8');
	} catch {
		return undefined;
	}
};

/** The clone's shared git directory, whether `root` is a checkout or a worktree. */
export const gitCommonDir = (root: string): string | undefined => {
	const dotGit = join(root, '.git');
	let gitDir: string | undefined;
	try {
		gitDir = statSync(dotGit).isDirectory()
			? dotGit
			: (() => {
					const pointer = /^gitdir:\s*(.+)$/mu
						.exec(readText(dotGit) ?? '')?.[1]
						?.trim();
					return pointer === undefined
						? undefined
						: isAbsolute(pointer)
							? pointer
							: resolve(root, pointer);
				})();
	} catch {
		return undefined;
	}
	if (gitDir === undefined) return undefined;
	const common = readText(join(gitDir, 'commondir'))?.trim();
	return common === undefined || common.length === 0
		? gitDir
		: resolve(gitDir, common);
};

/** The cache directory the project's configuration names. */
export const configuredCacheDir = (root: string): string => {
	const config = parseJsonc(
		readText(join(root, 'delendai.config.json')) ?? '{}',
	) as { cacheDir?: unknown } | undefined;
	return typeof config?.cacheDir === 'string' && config.cacheDir.length > 0
		? config.cacheDir
		: DEFAULT_CACHE_DIR;
};

/** The cache directory last applied here, as remembered; the configured one otherwise. */
export const appliedCacheDir = (root: string): string => {
	const common = gitCommonDir(root);
	const remembered =
		common === undefined
			? undefined
			: readText(join(common, CACHE_DIR_POINTER))?.trim();
	return remembered !== undefined && remembered.length > 0
		? remembered
		: configuredCacheDir(root);
};

/** Remembers the cache directory now applied, so the next start finds the records. */
export const rememberAppliedCacheDir = (
	root: string,
	cacheDir: string,
): void => {
	const common = gitCommonDir(root);
	if (common === undefined) return;
	try {
		writeFileSync(join(common, CACHE_DIR_POINTER), `${cacheDir}\n`);
	} catch {
		// Unwritable git directory: the configured cache directory is used.
	}
};

/** The absolute folder delendai's records for `root` live in. */
export const recordsDir = (root: string): string =>
	join(root, appliedCacheDir(root), RECORDS_DIR);

/** The absolute path of one record, creating its folder when asked. */
export const recordPath = (
	root: string,
	...segments: readonly string[]
): string => join(recordsDir(root), ...segments);

/** Whether an older delendai left its records at the workspace root. */
export const hasLegacyRecords = (root: string): boolean =>
	existsSync(join(root, LEGACY_RECORDS_DIR));

export const ensureRecordsDir = (root: string): string => {
	const dir = recordsDir(root);
	mkdirSync(dir, { recursive: true });
	return dir;
};

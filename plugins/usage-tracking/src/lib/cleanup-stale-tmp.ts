/**
 * cleanup-stale-tmp.ts — a00072 S7.b.
 *
 * On every plugin boot, sweep the plugin cache dir for `.tmp` files
 * that are older than `STALE_TMP_MS` (60s) and 0 bytes. A 0-byte tmp
 * that survived a previous run is a crashed mid-write from the
 * atomic-rename pattern that `writeSummary` uses — it must be
 * removed so the next write does not trip over a stale sibling.
 *
 * The function is a no-op when the cache dir is missing (fresh
 * install) and never throws — boot hygiene must never fail the
 * plugin. Tests inject a `now` function for determinism.
 */

import { readdir, stat, unlink } from 'node:fs/promises';
import { join } from 'node:path';

const DEFAULT_STALE_TMP_MS = 60_000;

export interface ICleanupStaleTmpOptions {
	/** Absolute path to the plugin cache dir to sweep. */
	readonly cacheDirAbs: string;
	/** Threshold in ms — files older than this are stale. Defaults to 60_000. */
	readonly staleMs?: number;
	/** Injected time source for tests. */
	readonly now?: () => number;
}

/** Summary of what was cleaned. */
export interface ICleanupStaleTmpResult {
	readonly scanned: number;
	readonly removed: number;
	readonly removedPaths: readonly string[];
}

/**
 * Sweep `cacheDirAbs` for 0-byte `.tmp` files older than
 * `staleMs` and unlink them. Returns a summary the caller can
 * log. Misses (missing dir, unreadable files) are swallowed.
 */
export const cleanupStaleTmpFiles = async (
	options: ICleanupStaleTmpOptions,
): Promise<ICleanupStaleTmpResult> => {
	const staleMs = options.staleMs ?? DEFAULT_STALE_TMP_MS;
	const now = options.now ?? Date.now;
	const removed: string[] = [];
	let scanned = 0;

	const entries = await readdir(options.cacheDirAbs, {
		withFileTypes: true,
	}).catch(() => []);
	for (const entry of entries) {
		if (!entry.isFile()) continue;
		if (!entry.name.endsWith('.tmp')) continue;
		const abs = join(options.cacheDirAbs, entry.name);
		scanned += 1;
		const info = await stat(abs).catch(() => null);
		if (info === null) continue;
		if (info.size !== 0) continue;
		if (now() - info.mtimeMs < staleMs) continue;
		await unlink(abs).catch(() => undefined);
		removed.push(abs);
	}
	return {
		scanned,
		removed: removed.length,
		removedPaths: removed,
	};
};

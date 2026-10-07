import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';

import type { ILifecycleScope, ILifecycleStateStore } from '@delendai/state';

import {
	CACHE_LAYOUT_LOCK_TIMEOUT_MS,
	CACHE_LAYOUT_MARKER_PATH,
} from '../contracts/constants/cache-layout.constant';
import { writeFileAtomic } from '../shared/atomic-write';
import { ensureSelfIgnoringDir } from '../shared/self-ignoring-dir';
import { withFileMutex } from '../shared/with-file-mutex';

type IMarkerContent = Partial<Record<ILifecycleScope, number>>;

const readMarker = async (markerAbs: string): Promise<IMarkerContent> => {
	let raw: string;
	try {
		raw = await readFile(markerAbs, 'utf8');
	} catch (error) {
		if (
			error instanceof Error &&
			'code' in error &&
			error.code === 'ENOENT'
		)
			return {};
		throw error;
	}
	// A marker nobody can parse is the same as no marker: the migrations
	// are idempotent, so running the chain again is safe, while refusing to
	// start over a damaged file would stop the server for no gain.
	try {
		const parsed: unknown = JSON.parse(raw);
		if (
			typeof parsed !== 'object' ||
			parsed === null ||
			Array.isArray(parsed)
		)
			return {};
		const epoch = (parsed as IMarkerContent)['cache-layout'];
		return typeof epoch === 'number' && Number.isInteger(epoch)
			? { 'cache-layout': epoch }
			: {};
	} catch {
		return {};
	}
};

/**
 * The lifecycle epoch kept in `.delendai/cache-layout-applied.json`.
 *
 * Used while the state database is not the canonical store: core cannot
 * open one (it has no SQLite driver of its own). The lock is the shared
 * file mutex, so two processes starting together run one migration.
 */
export const createFileLifecycleStateStore = (
	workspaceRoot: string,
): ILifecycleStateStore => {
	const markerAbs = join(workspaceRoot, ...CACHE_LAYOUT_MARKER_PATH);
	return {
		getAppliedEpoch: async (scope) =>
			(await readMarker(markerAbs))[scope] ?? null,
		setAppliedEpoch: async (scope, epoch) => {
			// Not `mkdir`: the directory has to hide itself as it appears.
			await ensureSelfIgnoringDir(dirname(markerAbs));
			const marker = { ...(await readMarker(markerAbs)), [scope]: epoch };
			await writeFileAtomic(
				markerAbs,
				`${JSON.stringify(marker, null, '\t')}\n`,
			);
		},
		withMigrationLock: async (fn) => {
			await ensureSelfIgnoringDir(dirname(markerAbs));
			return withFileMutex(markerAbs, fn, {
				timeoutMs: CACHE_LAYOUT_LOCK_TIMEOUT_MS,
			});
		},
	};
};

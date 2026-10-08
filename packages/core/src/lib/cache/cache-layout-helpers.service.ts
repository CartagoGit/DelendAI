import {
	lstat,
	mkdir,
	readdir,
	realpath,
	rename,
	rm,
	rmdir,
} from 'node:fs/promises';
import { dirname, join, sep } from 'node:path';

import type {
	ICacheLayoutHelpers,
	ICacheLayoutHelpersOptions,
} from '../contracts/interfaces/cache-layout.interface';
import {
	assertContainedRelativePath,
	assertDroppable,
	CacheLayoutError,
} from './cache-layout-migration.helper';

const isMissing = (error: unknown): boolean =>
	error instanceof Error && 'code' in error && error.code === 'ENOENT';

const lstatOrUndefined = async (path: string) => {
	try {
		return await lstat(path);
	} catch (error) {
		if (isMissing(error)) return undefined;
		throw error;
	}
};

/** The real path of the nearest ancestor of `path` that exists. */
const realpathOfNearestAncestor = async (path: string): Promise<string> => {
	let current = path;
	for (;;) {
		try {
			return await realpath(current);
		} catch (error) {
			if (!isMissing(error)) throw error;
			const parent = dirname(current);
			if (parent === current) return current;
			current = parent;
		}
	}
};

/**
 * The only way a layout migration touches the disk.
 *
 * Every path is relative to the cache directory and is checked twice:
 * lexically (no `..`, no absolute path) and on disk (the nearest existing
 * ancestor, after symlinks, still lies inside the cache directory). A
 * symlink that points out of the cache is therefore never followed; a
 * symlink that IS the target is removed or moved as a link, not its
 * destination.
 */
export const createCacheLayoutHelpers = (
	options: ICacheLayoutHelpersOptions,
): ICacheLayoutHelpers => {
	const resolveInside = async (relPath: string): Promise<string> => {
		assertContainedRelativePath(relPath);
		const abs = join(options.cacheDirAbs, ...relPath.split('/'));
		const realRoot = await realpathOfNearestAncestor(options.cacheDirAbs);
		const realParent = await realpathOfNearestAncestor(dirname(abs));
		if (
			realParent !== realRoot &&
			!realParent.startsWith(`${realRoot}${sep}`)
		)
			throw new CacheLayoutError(
				`${relPath} resolves outside the cache directory`,
			);
		return abs;
	};
	const refuseInDryRun = (what: string): void => {
		if (options.dryRun)
			throw new CacheLayoutError(`${what} is not allowed in a dry run`);
	};
	return {
		assertContained: assertContainedRelativePath,
		pathExists: async (relPath) =>
			(await lstatOrUndefined(await resolveInside(relPath))) !==
			undefined,
		dropDerived: async (relPath) => {
			refuseInDryRun('dropDerived');
			assertDroppable(options.manifest, relPath);
			// `rm` does not follow a symlink it is given: it removes the link.
			await rm(await resolveInside(relPath), {
				recursive: true,
				force: true,
			});
		},
		moveIfDestinationMissing: async (fromRel, toRel) => {
			refuseInDryRun('moveIfDestinationMissing');
			const from = await resolveInside(fromRel);
			const to = await resolveInside(toRel);
			if ((await lstatOrUndefined(from)) === undefined)
				return 'skipped-missing-source';
			if ((await lstatOrUndefined(to)) !== undefined)
				return 'skipped-conflict';
			await mkdir(dirname(to), { recursive: true });
			await rename(from, to);
			return 'moved';
		},
		removeEmptyDirectory: async (relPath) => {
			refuseInDryRun('removeEmptyDirectory');
			const abs = await resolveInside(relPath);
			const info = await lstatOrUndefined(abs);
			if (info === undefined || !info.isDirectory()) return;
			if ((await readdir(abs)).length > 0) return;
			await rmdir(abs);
		},
	};
};

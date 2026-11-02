import { lstat, mkdir, readdir, rename, rm } from 'node:fs/promises';
import { dirname, isAbsolute, join, relative } from 'node:path';

import { resolveWorkspaceContained } from '../shared/contain-path';
import { ensureSelfIgnoringDir } from '../shared/self-ignoring-dir';

export interface ICacheLayoutBootstrapOptions {
	readonly workspaceRootAbs: string;
	readonly cacheDirAbs: string;
	readonly pluginCacheDirs?: readonly string[];
	readonly createPluginDirs?: boolean;
	readonly legacyPaths?: readonly {
		readonly sourceAbs: string;
		readonly destinationAbs: string;
	}[];
	readonly includeBuiltInLegacyPaths?: boolean;
	readonly createCacheDir?: boolean;
	readonly apply?: boolean;
}

export interface ICacheLayoutBootstrapResult {
	readonly cacheDirAbs: string;
	readonly created: readonly string[];
	readonly migrated: readonly { from: string; to: string }[];
	readonly pending: readonly { from: string; to: string }[];
}

const CANONICAL_PLUGIN_DIRS = ['commit-policy', 'verify-tmp'] as const;

/** How old an empty cache folder must be before start-up removes it. */
const EMPTY_DIR_GRACE_MS = 24 * 60 * 60 * 1000;

const LEGACY_DIRS: Readonly<Record<string, string>> = {
	'.commit-policy': 'commit-policy',
	'.verify-tmp': 'verify-tmp',
};

const NESTED_CACHE_ROOT = ['.cache', 'delendai'] as const;

const isMissing = async (path: string): Promise<boolean> => {
	try {
		await lstat(path);
		return false;
	} catch (error) {
		return (
			error instanceof Error && 'code' in error && error.code === 'ENOENT'
		);
	}
};

const moveDirectoryContents = async (
	source: string,
	destination: string,
	apply: boolean,
): Promise<boolean> => {
	if (!apply) return true;
	await mkdir(destination, { recursive: true });
	let moved = false;
	const entries = await readdir(source, { withFileTypes: true });
	for (const entry of entries) {
		const from = join(source, entry.name);
		const to = join(destination, entry.name);
		if (!(await isMissing(to))) {
			if (entry.isDirectory() && (await lstat(to)).isDirectory()) {
				moved = (await moveDirectoryContents(from, to, apply)) || moved;
			}
			continue;
		}
		await rename(from, to);
		moved = true;
	}
	if ((await readdir(source)).length === 0)
		await rm(source, { recursive: true });
	return moved;
};

const reconcilePath = async (
	source: string,
	destination: string,
	apply: boolean,
): Promise<boolean> => {
	const destinationRelativeToSource = relative(source, destination);
	const destinationIsInsideSource =
		destinationRelativeToSource.length > 0 &&
		!destinationRelativeToSource.startsWith('..') &&
		destinationRelativeToSource !== destination;
	if (
		source === destination ||
		destinationIsInsideSource ||
		(await isMissing(source))
	)
		return false;
	if (await isMissing(destination)) {
		if (apply) {
			await mkdir(dirname(destination), { recursive: true });
			await rename(source, destination);
		}
		return true;
	}
	const [sourceInfo, destinationInfo] = await Promise.all([
		lstat(source),
		lstat(destination),
	]);
	if (!sourceInfo.isDirectory() || !destinationInfo.isDirectory())
		return true;
	return moveDirectoryContents(source, destination, apply);
};

const isEmptyTree = async (path: string): Promise<boolean> => {
	const entries = await readdir(path, { withFileTypes: true });
	for (const entry of entries) {
		if (!entry.isDirectory()) return false;
		if (!(await isEmptyTree(join(path, entry.name)))) return false;
	}
	return true;
};

const removeEmptyNestedCacheRoot = async (
	cacheDirAbs: string,
	apply: boolean,
): Promise<void> => {
	const nestedCacheRoot = join(cacheDirAbs, ...NESTED_CACHE_ROOT);
	const nestedCacheParent = join(cacheDirAbs, NESTED_CACHE_ROOT[0]);
	if (await isMissing(nestedCacheRoot)) return;
	if (!(await isEmptyTree(nestedCacheRoot)) || !apply) return;
	await rm(nestedCacheRoot, { recursive: true });
	if (await isEmptyTree(nestedCacheParent))
		await rm(nestedCacheParent, { recursive: true });
};

/**
 * A plugin's cache folder used to be made at start for every plugin,
 * written or not, and the spec runs of September left empty trees under
 * `verify/`. Nothing removed them when that stopped: on 2026-10-29 one
 * checkout held 65 empty folders. A tree with no file in it holds nothing,
 * so it goes; anything with a file stays.
 */
const removeEmptyLegacyDirs = async (
	cacheDirAbs: string,
	apply: boolean,
	now: number = Date.now(),
): Promise<void> => {
	if (!apply) return;
	for (const entry of await readdir(cacheDirAbs, { withFileTypes: true })) {
		if (!entry.isDirectory()) continue;
		const target = join(cacheDirAbs, entry.name);
		// A day's grace: a plugin that has just made its folder to write
		// into it is not racing this.
		if (now - (await lstat(target)).mtimeMs < EMPTY_DIR_GRACE_MS) continue;
		if (await isEmptyTree(target)) await rm(target, { recursive: true });
	}
};

/** Establish the shared cache layout and migrate known runtime directories. */
export const bootstrapCacheLayout = async (
	options: ICacheLayoutBootstrapOptions,
): Promise<ICacheLayoutBootstrapResult> => {
	const contained = resolveWorkspaceContained(
		options.workspaceRootAbs,
		isAbsolute(options.cacheDirAbs)
			? relative(options.workspaceRootAbs, options.cacheDirAbs)
			: options.cacheDirAbs,
	);
	if (!contained.ok) {
		throw new Error(
			`cacheDir escapes workspace: ${options.cacheDirAbs} (${contained.reason})`,
		);
	}
	if (await isMissing(options.workspaceRootAbs)) {
		return {
			cacheDirAbs: contained.abs,
			created: [],
			migrated: [],
			pending: [],
		};
	}

	const created: string[] = [];
	const migrated: { from: string; to: string }[] = [];
	const pending: { from: string; to: string }[] = [];
	const apply = options.apply ?? true;
	if (apply && options.createCacheDir !== false) {
		// Not a bare `mkdir`. This directory appears in somebody's
		// project the first time they run anything, with a sqlite
		// database in it, and `git status` said `?? .cache/` — which is
		// what the workflow doctor reported the first time it was pointed
		// at a project that was not this one.
		//
		// The ignore goes on OUR subtree (`<cacheDir>/.gitignore`) and
		// never on `.cache/` itself: that directory may be the project's,
		// with the project's own things in it, and hiding those would be
		// a different kind of wrong. x00596.
		await ensureSelfIgnoringDir(contained.abs);
	}

	const legacyPaths = [
		...(options.includeBuiltInLegacyPaths === false
			? []
			: Object.entries(LEGACY_DIRS).map(([source, destination]) => ({
					sourceAbs: join(options.workspaceRootAbs, source),
					destinationAbs: join(contained.abs, destination),
				}))),
		...(options.legacyPaths ?? []),
	];
	for (const {
		sourceAbs: source,
		destinationAbs: destination,
	} of legacyPaths) {
		if (source === join(options.workspaceRootAbs, '.git')) continue;
		if (source === destination) continue;
		if (await reconcilePath(source, destination, apply)) {
			pending.push({ from: source, to: destination });
			if (!apply) continue;
			migrated.push({ from: source, to: destination });
		}
	}
	// Older hosts resolved the configured cache root twice and created
	// `<cacheDir>/.cache/delendai`. Remove that exact empty legacy
	// directory, but never delete files or non-empty cache data implicitly.
	await removeEmptyNestedCacheRoot(contained.abs, apply);
	await removeEmptyLegacyDirs(contained.abs, apply);

	if (options.createPluginDirs === true) {
		const directories = new Set([
			...CANONICAL_PLUGIN_DIRS,
			...(options.pluginCacheDirs ?? []),
		]);
		for (const directory of directories) {
			const destination = join(contained.abs, directory);
			if (apply && (await isMissing(destination))) {
				await mkdir(destination, { recursive: true });
				created.push(destination);
			}
		}
	}

	return { cacheDirAbs: contained.abs, created, migrated, pending };
};

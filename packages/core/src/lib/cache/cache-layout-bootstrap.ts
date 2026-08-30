import { lstat, mkdir, readdir, rename, rm } from 'node:fs/promises';
import { join } from 'node:path';

import { resolveWorkspaceContained } from '../shared/contain-path';

export interface ICacheLayoutBootstrapOptions {
	readonly workspaceRootAbs: string;
	readonly cacheDirAbs: string;
	readonly pluginCacheDirs?: readonly string[];
	readonly createPluginDirs?: boolean;
}

export interface ICacheLayoutBootstrapResult {
	readonly cacheDirAbs: string;
	readonly created: readonly string[];
	readonly migrated: readonly { from: string; to: string }[];
}

const CANONICAL_PLUGIN_DIRS = ['commit-policy', 'verify-tmp'] as const;

const LEGACY_DIRS: Readonly<Record<string, string>> = {
	'.commit-policy': 'commit-policy',
	'.verify-tmp': 'verify-tmp',
};

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
): Promise<boolean> => {
	await mkdir(destination, { recursive: true });
	let moved = false;
	const entries = await readdir(source, { withFileTypes: true });
	for (const entry of entries) {
		const from = join(source, entry.name);
		const to = join(destination, entry.name);
		if (!(await isMissing(to))) {
			if (entry.isDirectory() && (await lstat(to)).isDirectory()) {
				moved = (await moveDirectoryContents(from, to)) || moved;
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

/** Establish the shared cache layout and migrate known runtime directories. */
export const bootstrapCacheLayout = async (
	options: ICacheLayoutBootstrapOptions,
): Promise<ICacheLayoutBootstrapResult> => {
	const contained = resolveWorkspaceContained(
		options.workspaceRootAbs,
		options.cacheDirAbs,
	);
	if (!contained.ok) {
		throw new Error(
			`cacheDir escapes workspace: ${options.cacheDirAbs} (${contained.reason})`,
		);
	}

	const created: string[] = [];
	const migrated: { from: string; to: string }[] = [];
	await mkdir(contained.abs, { recursive: true });

	for (const [legacyName, canonicalName] of Object.entries(LEGACY_DIRS)) {
		const source = join(options.workspaceRootAbs, legacyName);
		const destination = join(contained.abs, canonicalName);
		if (await isMissing(source)) continue;
		if (await isMissing(destination)) {
			await rename(source, destination);
			migrated.push({ from: source, to: destination });
			continue;
		}
		if (await moveDirectoryContents(source, destination)) {
			migrated.push({ from: source, to: destination });
		}
	}

	if (options.createPluginDirs === true) {
		const directories = new Set([
			...CANONICAL_PLUGIN_DIRS,
			...(options.pluginCacheDirs ?? []),
		]);
		for (const directory of directories) {
			const destination = join(contained.abs, directory);
			if (await isMissing(destination)) {
				await mkdir(destination, { recursive: true });
				created.push(destination);
			}
		}
	}

	return { cacheDirAbs: contained.abs, created, migrated };
};

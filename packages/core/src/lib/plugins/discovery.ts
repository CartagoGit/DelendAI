import { access, readdir, stat } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import type { Dirent } from 'node:fs';

import type { ILazyPluginLoader, IPluginManifest } from './lazy-loader';

const DEFAULT_PLUGINS_DIR = 'plugins';
const DEFAULT_MANIFEST_FILE = 'plugin.manifest.ts';

export interface IPluginDiscoveryStats {
	readonly cacheHits: number;
	readonly cacheMisses: number;
	readonly manifestReads: number;
	readonly manifestCount: number;
	readonly lastScanMs: number;
	readonly lastCacheToken?: string;
}

export interface ILazyPluginDiscovery {
	pluginIds(): Promise<readonly string[]>;
	manifests(): Promise<readonly IPluginManifest[]>;
	findToolOwner(toolName: string): Promise<IPluginManifest | undefined>;
	findPromptOwner(promptName: string): Promise<IPluginManifest | undefined>;
	findResourceOwner(
		resourceUri: string,
	): Promise<IPluginManifest | undefined>;
	invalidate(): void;
	stats(): IPluginDiscoveryStats;
}

export interface ILazyPluginDiscoveryOptions {
	readonly loader: Pick<ILazyPluginLoader, 'readManifest'>;
	readonly listPluginIds: () => Promise<readonly string[]>;
	readonly readCacheToken?: () => Promise<string>;
}

interface IDiscoveryCache {
	readonly token?: string;
	readonly pluginIds: readonly string[];
	readonly manifests: readonly IPluginManifest[];
	readonly scanMs: number;
}

const findManifestBy = (
	manifests: readonly IPluginManifest[],
	predicate: (manifest: IPluginManifest) => boolean,
): IPluginManifest | undefined => manifests.find(predicate);

export const createLazyPluginDiscovery = (
	options: ILazyPluginDiscoveryOptions,
): ILazyPluginDiscovery => {
	let cache: IDiscoveryCache | undefined;
	let inflight: Promise<IDiscoveryCache> | undefined;
	let cacheHits = 0;
	let cacheMisses = 0;
	let manifestReads = 0;

	const readCache = async (): Promise<IDiscoveryCache> => {
		const token = await options.readCacheToken?.();
		if (cache !== undefined && cache.token === token) {
			cacheHits += 1;
			return cache;
		}
		if (inflight !== undefined) return inflight;
		cacheMisses += 1;
		inflight = (async (): Promise<IDiscoveryCache> => {
			const startedAt = Date.now();
			const pluginIds = [...(await options.listPluginIds())].sort(
				(a, b) => a.localeCompare(b),
			);
			const manifests = (
				await Promise.all(
					pluginIds.map(async (id) => {
						manifestReads += 1;
						return options.loader.readManifest(id);
					}),
				)
			).filter(
				(manifest): manifest is IPluginManifest =>
					manifest !== undefined,
			);
			const nextCache: IDiscoveryCache = {
				pluginIds,
				manifests,
				scanMs: Date.now() - startedAt,
				...(token === undefined ? {} : { token }),
			};
			cache = nextCache;
			return nextCache;
		})().finally(() => {
			inflight = undefined;
		});
		return inflight;
	};

	return {
		async pluginIds() {
			return (await readCache()).pluginIds;
		},
		async manifests() {
			return (await readCache()).manifests;
		},
		async findToolOwner(toolName) {
			return findManifestBy(await this.manifests(), (manifest) =>
				manifest.toolNames.includes(toolName),
			);
		},
		async findPromptOwner(promptName) {
			return findManifestBy(await this.manifests(), (manifest) =>
				manifest.promptNames.includes(promptName),
			);
		},
		async findResourceOwner(resourceUri) {
			return findManifestBy(await this.manifests(), (manifest) =>
				manifest.resourceUris.includes(resourceUri),
			);
		},
		invalidate() {
			cache = undefined;
			inflight = undefined;
		},
		stats() {
			return {
				cacheHits,
				cacheMisses,
				manifestReads,
				manifestCount: cache?.manifests.length ?? 0,
				lastScanMs: cache?.scanMs ?? 0,
				...(cache?.token === undefined
					? {}
					: { lastCacheToken: cache.token }),
			};
		},
	};
};

export interface IWorkspaceLazyPluginDiscoveryOptions {
	readonly loader: Pick<ILazyPluginLoader, 'readManifest'>;
	readonly rootDir?: string;
	readonly pluginsDirName?: string;
	readonly manifestFileName?: string;
}

export const listWorkspacePluginIds = async (options?: {
	readonly rootDir?: string;
	readonly pluginsDirName?: string;
	readonly manifestFileName?: string;
}): Promise<readonly string[]> => {
	const rootDir = options?.rootDir ?? process.cwd();
	const pluginsDirName = options?.pluginsDirName ?? DEFAULT_PLUGINS_DIR;
	const manifestFileName = options?.manifestFileName ?? DEFAULT_MANIFEST_FILE;
	const pluginsDir = resolve(rootDir, pluginsDirName);
	let entries: Dirent[];
	try {
		entries = await readdir(pluginsDir, { withFileTypes: true });
	} catch {
		return [];
	}
	const ids: string[] = [];
	for (const entry of entries.sort((left, right) =>
		left.name.localeCompare(right.name),
	)) {
		if (!entry.isDirectory()) continue;
		try {
			await access(join(pluginsDir, entry.name, manifestFileName));
			ids.push(entry.name);
		} catch {}
	}
	return ids;
};

export const readWorkspacePluginDiscoveryCacheToken = async (options?: {
	readonly rootDir?: string;
	readonly pluginsDirName?: string;
	readonly manifestFileName?: string;
}): Promise<string> => {
	const rootDir = options?.rootDir ?? process.cwd();
	const pluginsDirName = options?.pluginsDirName ?? DEFAULT_PLUGINS_DIR;
	const manifestFileName = options?.manifestFileName ?? DEFAULT_MANIFEST_FILE;
	const pluginsDir = resolve(rootDir, pluginsDirName);
	let entries: Dirent[];
	try {
		entries = await readdir(pluginsDir, { withFileTypes: true });
	} catch {
		return 'missing';
	}
	const tokens = await Promise.all(
		entries
			.filter((entry) => entry.isDirectory())
			.sort((left, right) => left.name.localeCompare(right.name))
			.map(async (entry) => {
				const manifestPath = join(
					pluginsDir,
					entry.name,
					manifestFileName,
				);
				try {
					const manifestStat = await stat(manifestPath);
					return `${entry.name}:${manifestStat.mtimeMs}`;
				} catch {
					return `${entry.name}:missing`;
				}
			}),
	);
	return tokens.join('|');
};

export const createWorkspaceLazyPluginDiscovery = (
	options: IWorkspaceLazyPluginDiscoveryOptions,
): ILazyPluginDiscovery => {
	const workspaceOptions = {
		...(options.rootDir === undefined ? {} : { rootDir: options.rootDir }),
		...(options.pluginsDirName === undefined
			? {}
			: { pluginsDirName: options.pluginsDirName }),
		...(options.manifestFileName === undefined
			? {}
			: { manifestFileName: options.manifestFileName }),
	};
	return createLazyPluginDiscovery({
		loader: options.loader,
		listPluginIds: () => listWorkspacePluginIds(workspaceOptions),
		readCacheToken: () =>
			readWorkspacePluginDiscoveryCacheToken(workspaceOptions),
	});
};

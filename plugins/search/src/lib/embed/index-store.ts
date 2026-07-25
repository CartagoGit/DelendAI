import { readFile } from 'node:fs/promises';
import { isAbsolute, join } from 'node:path';

import { withFileMutex, writeFileAtomic } from '@mcp-vertex/core/public';

export interface IEmbedIndexEntry {
	readonly path: string;
	readonly mtimeMs: number;
	readonly vector: readonly number[];
}

export type IEmbedIndex = Readonly<Record<string, IEmbedIndexEntry>>;

export interface IEmbedIndexStore {
	readonly indexPath: string;
	load(): Promise<IEmbedIndex>;
	save(index: IEmbedIndex): Promise<void>;
}

export interface IEmbedIndexStoreOptions {
	readonly workspaceRootAbs?: string;
	readonly cacheDir?: string;
	readonly pluginCacheDir?: string;
	readonly indexPath?: string;
}

const DEFAULT_CACHE_DIR = join(process.cwd(), '.cache', 'mcp-vertex');
const EMBED_INDEX_FILE = 'embed-index.json';

const resolveCacheRoot = (options: IEmbedIndexStoreOptions): string => {
	if (options.cacheDir === undefined) {
		return DEFAULT_CACHE_DIR;
	}
	if (isAbsolute(options.cacheDir)) {
		return options.cacheDir;
	}
	return options.workspaceRootAbs !== undefined
		? join(options.workspaceRootAbs, options.cacheDir)
		: join(process.cwd(), options.cacheDir);
};

const resolvePluginCacheDir = (options: IEmbedIndexStoreOptions): string => {
	if (options.pluginCacheDir === undefined) {
		return join(resolveCacheRoot(options), 'search');
	}
	if (isAbsolute(options.pluginCacheDir)) {
		return options.pluginCacheDir;
	}
	return options.workspaceRootAbs !== undefined
		? join(options.workspaceRootAbs, options.pluginCacheDir)
		: join(process.cwd(), options.pluginCacheDir);
};

export const resolveEmbedIndexPath = (
	options: IEmbedIndexStoreOptions = {},
): string =>
	options.indexPath ?? join(resolvePluginCacheDir(options), EMBED_INDEX_FILE);

const toSortedIndex = (index: IEmbedIndex): IEmbedIndex =>
	Object.fromEntries(
		Object.entries(index).sort(([leftHash], [rightHash]) =>
			leftHash.localeCompare(rightHash),
		),
	) as IEmbedIndex;

const parseIndex = (raw: string): IEmbedIndex => {
	const parsed: unknown = JSON.parse(raw);
	if (
		typeof parsed !== 'object' ||
		parsed === null ||
		Array.isArray(parsed)
	) {
		return {};
	}
	const entries = Object.entries(parsed).flatMap(([hash, value]) => {
		if (
			typeof value !== 'object' ||
			value === null ||
			Array.isArray(value)
		) {
			return [];
		}
		const candidate = value as {
			readonly path?: unknown;
			readonly mtimeMs?: unknown;
			readonly vector?: unknown;
		};
		if (
			typeof candidate.path !== 'string' ||
			typeof candidate.mtimeMs !== 'number' ||
			!Array.isArray(candidate.vector) ||
			candidate.vector.some((item) => typeof item !== 'number')
		) {
			return [];
		}
		return [
			[
				hash,
				{
					path: candidate.path,
					mtimeMs: candidate.mtimeMs,
					vector: candidate.vector,
				},
			],
		] as const;
	});
	return Object.fromEntries(entries) as IEmbedIndex;
};

export const createEmbedIndexStore = (
	options: IEmbedIndexStoreOptions = {},
): IEmbedIndexStore => {
	const indexPath = resolveEmbedIndexPath(options);
	return {
		indexPath,
		load: async () => {
			const raw = await readFile(indexPath, 'utf8').catch((error) => {
				if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
					return undefined;
				}
				throw error;
			});
			if (raw === undefined) {
				return {};
			}
			return parseIndex(raw);
		},
		save: async (index: IEmbedIndex) => {
			await withFileMutex(indexPath, async () => {
				await writeFileAtomic(
					indexPath,
					`${JSON.stringify(toSortedIndex(index), null, 2)}\n`,
				);
			});
		},
	};
};

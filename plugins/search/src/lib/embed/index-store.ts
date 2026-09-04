import { basename, dirname, join } from 'node:path';

import {
	SafeWorkspaceReader,
	joinUnderRoot,
	withFileMutex,
	writeFileAtomic,
} from '@delendai/core/public';

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
	/**
	 * x00156 S6: required, no `process.cwd()` fallback. AGENTS.md rule 2
	 * ("no `process.cwd()` in engines") — a plugin wired without an
	 * explicit workspace root used to silently write its cache
	 * relative to whatever directory the host process happened to be
	 * cwd'd to, which `verify:tools` cannot detect because the
	 * orchestrator-runner host always supplies this option in
	 * practice. `createEmbedIndexStore` throws immediately if it is
	 * missing instead of guessing.
	 */
	readonly workspaceRootAbs: string;
	readonly cacheDir?: string;
	readonly pluginCacheDir?: string;
	readonly indexPath?: string;
}

const EMBED_INDEX_FILE = 'embed-index.json';

const resolveCacheRoot = (options: IEmbedIndexStoreOptions): string => {
	if (options.cacheDir === undefined) {
		return join(options.workspaceRootAbs, '.cache', 'mcp-vertex');
	}
	return joinUnderRoot(options.workspaceRootAbs, options.cacheDir);
};

const resolvePluginCacheDir = (options: IEmbedIndexStoreOptions): string => {
	if (options.pluginCacheDir === undefined) {
		return join(resolveCacheRoot(options), 'search');
	}
	return joinUnderRoot(options.workspaceRootAbs, options.pluginCacheDir);
};

export const resolveEmbedIndexPath = (
	options: IEmbedIndexStoreOptions,
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
	options: IEmbedIndexStoreOptions,
): IEmbedIndexStore => {
	if (
		typeof options.workspaceRootAbs !== 'string' ||
		options.workspaceRootAbs.length === 0
	) {
		throw new Error(
			'createEmbedIndexStore requires a non-empty workspaceRootAbs. ' +
				'Falling back to process.cwd() is forbidden — see AGENTS.md.',
		);
	}
	const indexPath = resolveEmbedIndexPath(options);
	return {
		indexPath,
		load: async () => {
			const raw = await new SafeWorkspaceReader(dirname(indexPath))
				.readText(basename(indexPath))
				.then((result) => result.content)
				.catch((error) => {
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

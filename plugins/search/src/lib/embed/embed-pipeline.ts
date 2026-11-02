import { createHash } from 'node:crypto';
import { basename, relative, sep } from 'node:path';

import { walkAllowedFiles } from '@delendai/core/public';
import { SafeWorkspaceReader } from '@delendai/core/runtime';

import type { ISearchOptions } from '../services/search-engine.service';
import {
	DEFAULT_EXTENSIONS,
	DEFAULT_IGNORE_DIRS,
	MAX_FILE_BYTES,
	extensionOf,
	matchesAnyGlob,
} from '../services/search-engine.constants';
import {
	isGitignored,
	parseGitignore,
} from '../services/search-engine.gitignore';
import { globToRegExp } from '../services/search-engine.glob';
import { resolveSearchRoots } from '../services/search-safe-reader';
import { defaultEmbedder, type IEmbedder } from './embedder';
import {
	createEmbedIndexStore,
	type IEmbedIndex,
	type IEmbedIndexEntry,
	type IEmbedIndexStore,
	type IEmbedIndexStoreOptions,
} from './index-store';

export interface IDiscoveredEmbedFile {
	readonly absPath: string;
	readonly relPath: string;
	readonly mtimeMs: number;
	readonly content: string;
	readonly hash: string;
}

export interface IEmbedPipelineOptions extends IEmbedIndexStoreOptions {
	readonly workspaceRootAbs: string;
	readonly searchOptions?: ISearchOptions;
	readonly embedder?: IEmbedder;
	readonly indexStore?: IEmbedIndexStore;
	/** Vector length the embedder produces now, when the caller already knows it. */
	readonly expectedDimension?: number;
}

export interface IEmbedPipelineResult {
	readonly available: boolean;
	readonly discoveredCount: number;
	readonly embeddedCount: number;
	readonly reusedCount: number;
	readonly index: IEmbedIndex;
}

const hashContent = (content: string): string =>
	createHash('sha256').update(content).digest('hex');

const normalizeExtensions = (options: ISearchOptions): ReadonlySet<string> =>
	new Set(
		(options.extensions && options.extensions.length > 0
			? options.extensions
			: DEFAULT_EXTENSIONS
		).map((extension) => extension.toLowerCase().replace(/^\./, '')),
	);

export const discoverEmbeddableFiles = async (
	workspaceRootAbs: string,
	options: ISearchOptions = {},
): Promise<readonly IDiscoveredEmbedFile[]> => {
	const reader = new SafeWorkspaceReader(workspaceRootAbs);
	const roots =
		options.roots !== undefined && options.roots.length > 0
			? options.roots
			: ['.'];
	const extensions = normalizeExtensions(options);
	const ignoreDirs = new Set(options.ignoreDirs ?? DEFAULT_IGNORE_DIRS);
	const includeGlobs = (options.include ?? []).map(globToRegExp);
	const excludeGlobs = (options.exclude ?? []).map(globToRegExp);
	const gitignoreRules =
		options.respectGitignore === false
			? []
			: parseGitignore(
					await reader
						.readText('.gitignore')
						.then((result) => result.content)
						.catch(() => ''),
				);

	const shouldIncludePath = (relPath: string, name: string): boolean => {
		if (
			gitignoreRules.length > 0 &&
			isGitignored(relPath, false, gitignoreRules)
		) {
			return false;
		}
		if (excludeGlobs.length > 0 && matchesAnyGlob(relPath, excludeGlobs)) {
			return false;
		}
		if (includeGlobs.length > 0) {
			return matchesAnyGlob(relPath, includeGlobs);
		}
		return extensions.has(extensionOf(name));
	};

	const discovered: IDiscoveredEmbedFile[] = [];
	const visitFile = async (absPath: string): Promise<void> => {
		const relPath = relative(workspaceRootAbs, absPath)
			.split(sep)
			.join('/');
		const file = await reader.readText(relPath).catch(() => undefined);
		if (
			file === undefined ||
			!file.stats.isFile() ||
			file.stats.size > MAX_FILE_BYTES
		) {
			return;
		}
		discovered.push({
			absPath,
			relPath,
			mtimeMs: file.stats.mtimeMs,
			content: file.content,
			hash: hashContent(file.content),
		});
	};

	const resolvedRoots = await resolveSearchRoots(reader, roots);
	for (const root of resolvedRoots.roots) {
		if (root.stats.isFile()) {
			const relPath = relative(workspaceRootAbs, root.path.absolutePath)
				.split(sep)
				.join('/');
			if (shouldIncludePath(relPath, basename(root.path.absolutePath))) {
				await visitFile(root.path.absolutePath);
			}
			continue;
		}
		if (!root.stats.isDirectory()) {
			continue;
		}
		await walkAllowedFiles({
			workspaceRootAbs,
			rootAbs: root.path.absolutePath,
			isTruncated: () => false,
			shouldSkipDir: (relDirPath, dirName) => {
				if (ignoreDirs.has(dirName)) {
					return true;
				}
				return (
					gitignoreRules.length > 0 &&
					isGitignored(relDirPath, true, gitignoreRules)
				);
			},
			visitFile: async (absPath) => {
				const relPath = relative(workspaceRootAbs, absPath)
					.split(sep)
					.join('/');
				if (!shouldIncludePath(relPath, basename(absPath))) {
					return;
				}
				await visitFile(absPath);
			},
		});
	}

	return discovered.sort((left, right) =>
		left.relPath.localeCompare(right.relPath),
	);
};

const removeDuplicatePaths = (
	index: IEmbedIndex,
	relPath: string,
): IEmbedIndex =>
	Object.fromEntries(
		Object.entries(index).filter(([, entry]) => entry.path !== relPath),
	) as IEmbedIndex;

/** Index key: one entry per path and content, so equal files at two paths both stay. */
export const embedIndexKey = (relPath: string, hash: string): string =>
	`${relPath}#${hash}`;

export const runEmbedPipeline = async (
	options: IEmbedPipelineOptions,
): Promise<IEmbedPipelineResult> => {
	const embedder = options.embedder ?? defaultEmbedder;
	if (!(await embedder.isAvailable())) {
		const indexStore =
			options.indexStore ??
			createEmbedIndexStore({
				workspaceRootAbs: options.workspaceRootAbs,
				...(options.cacheDir !== undefined
					? { cacheDir: options.cacheDir }
					: {}),
				...(options.pluginCacheDir !== undefined
					? { pluginCacheDir: options.pluginCacheDir }
					: {}),
			});
		return {
			available: false,
			discoveredCount: 0,
			embeddedCount: 0,
			reusedCount: 0,
			index: await indexStore.load(),
		};
	}

	const indexStore =
		options.indexStore ??
		createEmbedIndexStore({
			workspaceRootAbs: options.workspaceRootAbs,
			...(options.cacheDir !== undefined
				? { cacheDir: options.cacheDir }
				: {}),
			...(options.pluginCacheDir !== undefined
				? { pluginCacheDir: options.pluginCacheDir }
				: {}),
		});
	const discovered = await discoverEmbeddableFiles(
		options.workspaceRootAbs,
		options.searchOptions,
	);
	const currentIndex = await indexStore.load();
	let nextIndex: IEmbedIndex = {};
	let embeddedCount = 0;
	let reusedCount = 0;
	// A cached vector is only comparable to a fresh one of the same length.
	// The caller knows the length when it has already embedded a query.
	let expectedDimension = options.expectedDimension ?? embedder.dimensions;

	for (const file of discovered) {
		const key = embedIndexKey(file.relPath, file.hash);
		const cached = currentIndex[key];
		if (
			cached !== undefined &&
			cached.path === file.relPath &&
			cached.embedderId === embedder.id &&
			cached.dimension === cached.vector.length &&
			(expectedDimension === undefined ||
				cached.dimension === expectedDimension)
		) {
			nextIndex = {
				...removeDuplicatePaths(nextIndex, file.relPath),
				[key]: {
					path: file.relPath,
					mtimeMs: file.mtimeMs,
					vector: cached.vector,
					embedderId: embedder.id,
					dimension: cached.vector.length,
				},
			};
			reusedCount += 1;
			continue;
		}

		const vector = await embedder.embed(file.content);
		expectedDimension ??= vector.length;
		const entry: IEmbedIndexEntry = {
			path: file.relPath,
			mtimeMs: file.mtimeMs,
			vector,
			embedderId: embedder.id,
			dimension: vector.length,
		};
		nextIndex = {
			...removeDuplicatePaths(nextIndex, file.relPath),
			[key]: entry,
		};
		embeddedCount += 1;
	}

	await indexStore.save(nextIndex);
	return {
		available: true,
		discoveredCount: discovered.length,
		embeddedCount,
		reusedCount,
		index: nextIndex,
	};
};

export { hashContent };

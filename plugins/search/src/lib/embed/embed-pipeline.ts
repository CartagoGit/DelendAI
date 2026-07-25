import { createHash } from 'node:crypto';
import { basename, join, relative, sep } from 'node:path';
import { readFile, stat } from 'node:fs/promises';

import {
	resolveWorkspaceContained,
	walkAllowedFiles,
} from '@mcp-vertex/core/public';

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
					await readFile(
						join(workspaceRootAbs, '.gitignore'),
						'utf8',
					).catch(() => ''),
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
		const fileInfo = await stat(absPath).catch(() => undefined);
		if (
			fileInfo === undefined ||
			!fileInfo.isFile() ||
			fileInfo.size > MAX_FILE_BYTES
		) {
			return;
		}
		const content = await readFile(absPath, 'utf8').catch(() => undefined);
		if (content === undefined) {
			return;
		}
		const relPath = relative(workspaceRootAbs, absPath)
			.split(sep)
			.join('/');
		discovered.push({
			absPath,
			relPath,
			mtimeMs: fileInfo.mtimeMs,
			content,
			hash: hashContent(content),
		});
	};

	for (const root of roots) {
		const contained = resolveWorkspaceContained(workspaceRootAbs, root);
		if (!contained.ok) {
			continue;
		}
		const rootInfo = await stat(contained.abs).catch(() => undefined);
		if (rootInfo?.isFile()) {
			const relPath = relative(workspaceRootAbs, contained.abs)
				.split(sep)
				.join('/');
			if (shouldIncludePath(relPath, basename(contained.abs))) {
				await visitFile(contained.abs);
			}
			continue;
		}
		if (!rootInfo?.isDirectory()) {
			continue;
		}
		await walkAllowedFiles({
			workspaceRootAbs,
			rootAbs: contained.abs,
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

	for (const file of discovered) {
		const cached = currentIndex[file.hash];
		if (cached !== undefined && cached.path === file.relPath) {
			nextIndex = {
				...removeDuplicatePaths(nextIndex, file.relPath),
				[file.hash]: {
					path: file.relPath,
					mtimeMs: file.mtimeMs,
					vector: cached.vector,
				},
			};
			reusedCount += 1;
			continue;
		}

		const vector = await embedder.embed(file.content);
		const entry: IEmbedIndexEntry = {
			path: file.relPath,
			mtimeMs: file.mtimeMs,
			vector,
		};
		nextIndex = {
			...removeDuplicatePaths(nextIndex, file.relPath),
			[file.hash]: entry,
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

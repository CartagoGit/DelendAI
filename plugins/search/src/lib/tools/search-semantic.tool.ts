import { isAbsolute, join } from 'node:path';
import { readFile } from 'node:fs/promises';

import type { IRankedHit } from '../contracts/interfaces/hybrid-rank.interface';
import { runEmbedPipeline } from '../embed/embed-pipeline';
import { defaultEmbedder, type IEmbedder } from '../embed/embedder';
import { fuseRankings } from '../rank/fuse';
import { clampMaxResults, preview } from '../services/search-engine.constants';
import {
	searchWorkspace,
	type ISearchHit,
	type ISearchOptions,
	type ISearchResult,
} from '../services/search-engine.service';

export type SearchMode = 'lexical' | 'semantic' | 'hybrid';

export interface ISearchSemanticToolOptions {
	readonly workspaceRootAbs: string;
	readonly defaults?: ISearchOptions;
	readonly cacheDir?: string;
	readonly pluginCacheDir?: string;
	readonly embedder?: IEmbedder;
}

export interface ISearchToolArgs extends ISearchOptions {
	readonly query: string;
	readonly mode?: SearchMode;
}

const resolvePluginCacheDir = (options: ISearchSemanticToolOptions): string => {
	if (options.pluginCacheDir !== undefined) {
		return isAbsolute(options.pluginCacheDir)
			? options.pluginCacheDir
			: join(options.workspaceRootAbs, options.pluginCacheDir);
	}
	if (options.cacheDir !== undefined) {
		return isAbsolute(options.cacheDir)
			? join(options.cacheDir, 'search')
			: join(options.workspaceRootAbs, options.cacheDir, 'search');
	}
	return join(process.cwd(), '.cache', 'mcp-vertex', 'search');
};

const scoreToRankedHits = (
	hits: readonly ISearchHit[],
): readonly IRankedHit[] => {
	const ranked: IRankedHit[] = [];
	const seen = new Set<string>();
	for (const hit of hits) {
		if (seen.has(hit.file)) {
			continue;
		}
		seen.add(hit.file);
		ranked.push({
			id: hit.file,
			score: hits.length - ranked.length,
		});
	}
	return ranked;
};

const cosineSimilarity = (
	left: readonly number[],
	right: readonly number[],
): number => {
	const length = Math.min(left.length, right.length);
	if (length === 0) {
		return 0;
	}
	let dot = 0;
	let leftMagnitude = 0;
	let rightMagnitude = 0;
	for (let index = 0; index < length; index += 1) {
		const leftValue = left[index] ?? 0;
		const rightValue = right[index] ?? 0;
		dot += leftValue * rightValue;
		leftMagnitude += leftValue * leftValue;
		rightMagnitude += rightValue * rightValue;
	}
	if (leftMagnitude === 0 || rightMagnitude === 0) {
		return 0;
	}
	return dot / (Math.sqrt(leftMagnitude) * Math.sqrt(rightMagnitude));
};

const buildSyntheticHit = async (
	workspaceRootAbs: string,
	relPath: string,
): Promise<ISearchHit> => {
	const absPath = join(workspaceRootAbs, relPath);
	const content = await readFile(absPath, 'utf8').catch(() => '');
	const rawLines = content.split('\n');
	const lines =
		rawLines.length > 0 && rawLines[rawLines.length - 1] === ''
			? rawLines.slice(0, -1)
			: rawLines;
	const firstLineIndex = lines.findIndex((line) => line.trim().length > 0);
	const lineIndex = firstLineIndex >= 0 ? firstLineIndex : 0;
	return {
		file: relPath,
		line: lineIndex + 1,
		text: preview(lines[lineIndex] ?? ''),
	};
};

const toToolResult = async (
	orderedIds: readonly string[],
	lexicalHits: readonly ISearchHit[],
	workspaceRootAbs: string,
): Promise<readonly ISearchHit[]> => {
	const lexicalByFile = new Map<string, ISearchHit>();
	for (const hit of lexicalHits) {
		if (!lexicalByFile.has(hit.file)) {
			lexicalByFile.set(hit.file, hit);
		}
	}
	const resolved: ISearchHit[] = [];
	for (const id of orderedIds) {
		const lexical = lexicalByFile.get(id);
		if (lexical !== undefined) {
			resolved.push(lexical);
			continue;
		}
		resolved.push(await buildSyntheticHit(workspaceRootAbs, id));
	}
	return resolved;
};

export const runSearchWithMode = async (
	args: ISearchToolArgs,
	options: ISearchSemanticToolOptions,
): Promise<ISearchResult> => {
	const mode = args.mode ?? 'lexical';
	const searchOptions: ISearchOptions = {
		...(options.defaults ?? {}),
		...(args.roots !== undefined ? { roots: args.roots } : {}),
		...(args.maxResults !== undefined
			? { maxResults: args.maxResults }
			: {}),
		...(args.caseSensitive !== undefined
			? { caseSensitive: args.caseSensitive }
			: {}),
		...(args.regex !== undefined ? { regex: args.regex } : {}),
		...(args.include !== undefined ? { include: args.include } : {}),
		...(args.exclude !== undefined ? { exclude: args.exclude } : {}),
		...(args.context !== undefined ? { context: args.context } : {}),
		...(args.preferRg !== undefined ? { preferRg: args.preferRg } : {}),
	};

	const lexicalResult = await searchWorkspace(
		options.workspaceRootAbs,
		args.query,
		searchOptions,
	);
	if (mode === 'lexical') {
		return lexicalResult;
	}

	const embedder = options.embedder ?? defaultEmbedder;
	if (!(await embedder.isAvailable())) {
		return lexicalResult;
	}

	let queryVector: readonly number[];
	try {
		queryVector = await embedder.embed(args.query);
	} catch {
		return lexicalResult;
	}

	const pipeline = await runEmbedPipeline({
		workspaceRootAbs: options.workspaceRootAbs,
		searchOptions,
		embedder,
		pluginCacheDir: resolvePluginCacheDir(options),
	});
	if (!pipeline.available) {
		return lexicalResult;
	}

	const maxResults = clampMaxResults(
		args.maxResults ?? options.defaults?.maxResults,
	);
	const vectorRanking = Object.values(pipeline.index)
		.map((entry) => ({
			id: entry.path,
			score: cosineSimilarity(queryVector, entry.vector),
		}))
		.filter((entry) => entry.score > 0)
		.sort(
			(left, right) =>
				right.score - left.score || left.id.localeCompare(right.id),
		)
		.slice(0, maxResults * 2);

	const rankedIds =
		mode === 'semantic'
			? vectorRanking.map((entry) => entry.id)
			: fuseRankings({
					bm25: scoreToRankedHits(lexicalResult.hits),
					vector: vectorRanking,
				}).hits.map((entry) => entry.id);
	const truncated = rankedIds.length > maxResults;
	const hits = await toToolResult(
		rankedIds.slice(0, maxResults),
		lexicalResult.hits,
		options.workspaceRootAbs,
	);

	return {
		query: lexicalResult.query,
		hits,
		truncated,
		scanned: pipeline.discoveredCount,
		usedRg: lexicalResult.usedRg,
		...(lexicalResult.rgFallbackReason !== undefined
			? { rgFallbackReason: lexicalResult.rgFallbackReason }
			: {}),
		...(lexicalResult.diagnostic !== undefined
			? { diagnostic: lexicalResult.diagnostic }
			: {}),
	};
};

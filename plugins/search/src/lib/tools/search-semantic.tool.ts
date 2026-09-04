import { join } from 'node:path';

import z from 'zod';

import { SafeWorkspaceReader, joinUnderRoot } from '@delendai/core/public';

import type { IRankedHit } from '../contracts/interfaces/hybrid-rank.interface';
import {
	buildApiEmbedder,
	type IApiEmbedderFetch,
} from '../embed/build-api-embedder';
import {
	runEmbedPipeline,
	type IEmbedPipelineResult,
} from '../embed/embed-pipeline';
import { defaultEmbedder, type IEmbedder } from '../embed/embedder';
import {
	discoverProviders,
	resolveProviderApiKey,
	type IEmbedProviderId,
} from '../embed/providers';
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
	readonly env?: Readonly<Record<string, string | undefined>>;
	readonly fetch?: IApiEmbedderFetch;
	readonly hybridWeights?: {
		readonly bm25?: number;
		readonly vector?: number;
	};
}

export interface ISearchToolArgs extends ISearchOptions {
	readonly query: string;
	readonly mode?: SearchMode;
	readonly consent?: boolean;
	readonly providerId?: IEmbedProviderId;
}

const resolveEmbedder = (
	args: ISearchToolArgs,
	options: ISearchSemanticToolOptions,
): IEmbedder => {
	if (options.embedder !== undefined) {
		return options.embedder;
	}
	if (args.consent !== true) {
		return defaultEmbedder;
	}
	const provider =
		(args.providerId !== undefined
			? discoverProviders(options.env).find(
					(candidate) =>
						candidate.id === args.providerId && candidate.present,
				)
			: discoverProviders(options.env).find(
					(candidate) => candidate.present,
				)) ?? undefined;
	if (provider === undefined) {
		return defaultEmbedder;
	}
	const apiKey = resolveProviderApiKey(provider.id, options.env);
	if (apiKey === undefined) {
		return defaultEmbedder;
	}
	return buildApiEmbedder({
		providerId: provider.id,
		apiKey,
		...(options.fetch !== undefined ? { fetch: options.fetch } : {}),
		inputType: 'query',
	});
};

const resolvePluginCacheDir = (options: ISearchSemanticToolOptions): string => {
	if (options.pluginCacheDir !== undefined) {
		return joinUnderRoot(options.workspaceRootAbs, options.pluginCacheDir);
	}
	if (options.cacheDir !== undefined) {
		return join(
			joinUnderRoot(options.workspaceRootAbs, options.cacheDir),
			'search',
		);
	}
	// x00156 S6: workspaceRootAbs is already required on this options
	// interface — no process.cwd() fallback needed or allowed
	// (AGENTS.md rule 2).
	return join(options.workspaceRootAbs, '.cache', 'mcp-vertex', 'search');
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
	const content = await new SafeWorkspaceReader(workspaceRootAbs)
		.readText(relPath)
		.then((result) => result.content)
		.catch(() => '');
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

	const embedder = resolveEmbedder(args, options);
	if (!(await embedder.isAvailable())) {
		return lexicalResult;
	}

	let queryVector: readonly number[];
	let pipeline: IEmbedPipelineResult;
	try {
		queryVector = await embedder.embed(args.query);
		pipeline = await runEmbedPipeline({
			workspaceRootAbs: options.workspaceRootAbs,
			searchOptions,
			embedder,
			pluginCacheDir: resolvePluginCacheDir(options),
		});
	} catch {
		return lexicalResult;
	}
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
					...(options.hybridWeights !== undefined
						? { weights: options.hybridWeights }
						: {}),
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

/**
 * x00154 S4: explicit input/output schemas for the semantic-search
 * helper. The function is consumed by `search.tool.ts` — these
 * constants declare the helper's API surface so this `.tool.ts` file
 * satisfies the bootstrap §6 invariant (`Every public tool declares an
 * outputSchema` — extended here to the helper layer). Mirrors the
 * `ISearchToolArgs` + `ISearchResult` contracts.
 */
export const inputSchema = z.object({
	query: z.string(),
	mode: z.enum(['lexical', 'semantic', 'hybrid']).optional(),
	consent: z.boolean().optional(),
	providerId: z.enum(['openai', 'voyage', 'cohere']).optional(),
	roots: z.array(z.string()).optional(),
	maxResults: z.number().optional(),
	caseSensitive: z.boolean().optional(),
	regex: z.boolean().optional(),
	include: z.array(z.string()).optional(),
	exclude: z.array(z.string()).optional(),
	context: z.number().int().min(0).max(10).optional(),
	preferRg: z.boolean().optional(),
});

export const outputSchema = z.object({
	query: z.string(),
	hits: z.array(
		z.object({
			file: z.string(),
			line: z.number(),
			text: z.string(),
			before: z.array(z.string()).optional(),
			after: z.array(z.string()).optional(),
		}),
	),
	truncated: z.boolean(),
	scanned: z.number(),
	usedRg: z.boolean(),
	rgFallbackReason: z.string().optional(),
	diagnostic: z.string().optional(),
});

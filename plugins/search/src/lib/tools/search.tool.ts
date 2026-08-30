import z from 'zod';

import {
	DETAIL_LEVELS,
	projectDetail,
	toolError,
	toolJson,
	type Detail,
	type IToolRegistration,
} from '@mcp-vertex/core/public';

import type { IEmbedder } from '../embed/embedder';
import { discoverProviders, type IEmbedProviderId } from '../embed/providers';
import { InvalidSearchPatternError } from '../services/search-engine.service';
import type { ISearchOptions } from '../services/search-engine.service';
import type { IApiEmbedderFetch } from '../embed/build-api-embedder';
import { runSearchWithMode } from './search-semantic.tool';

const DetailSchema = z.enum(DETAIL_LEVELS);
const AvailableProviderSchema = z.object({
	id: z.enum(['openai', 'voyage', 'cohere']),
	present: z.boolean(),
});
const SearchHitSchema = z.object({
	file: z.string(),
	line: z.number(),
	text: z.string(),
	before: z.array(z.string()).optional(),
	after: z.array(z.string()).optional(),
});
const SearchOutputSchema = z.object({
	detail: DetailSchema.optional(),
	query: z.string(),
	count: z.number(),
	truncated: z.boolean(),
	scanned: z.number(),
	usedRg: z.boolean(),
	rgFallbackReason: z.string().optional(),
	diagnostic: z.string().optional(),
	availableProviders: z.array(AvailableProviderSchema),
	hits: z.array(SearchHitSchema),
});
const SearchInputSchema = z.object({
	query: z.string(),
	detail: DetailSchema.optional(),
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

type SearchPayload = {
	readonly query: string;
	readonly count: number;
	readonly truncated: boolean;
	readonly scanned: number;
	readonly usedRg: boolean;
	readonly rgFallbackReason?: string;
	readonly diagnostic?: string;
	readonly availableProviders: ReturnType<typeof discoverProviders>;
	readonly hits: Awaited<ReturnType<typeof runSearchWithMode>>['hits'];
};

const projectSearchPayload = (
	payload: SearchPayload,
	detail: Detail,
): SearchPayload =>
	projectDetail(
		payload,
		{
			compact: (full) => ({
				...full,
				availableProviders: [],
				hits: [],
			}),
			normal: (full) => ({
				...full,
				hits: full.hits.map(({ file, line, text }) => ({
					file,
					line,
					text,
				})),
			}),
			full: (full) => full,
		},
		detail,
	) as SearchPayload;

export interface ISearchToolOptions {
	readonly namespacePrefix: string;
	/** Absolute workspace root the engine walks. */
	readonly workspaceRootAbs: string;
	/** Host defaults (roots/extensions/ignoreDirs/maxResults) from config. */
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

/**
 * Textual workspace search. One tool, `search`, that greps allow-listed
 * text files under the configured roots and returns matching lines.
 * Low-token: capped result count and per-line preview.
 */
export const buildSearchToolRegistrations = (
	options: ISearchToolOptions,
): readonly IToolRegistration[] => {
	const prefix = options.namespacePrefix;
	const defaults = options.defaults ?? {};
	const availableProviders = discoverProviders(options.env);
	return [
		{
			id: 'search',
			summary:
				'Search workspace text files for a query (grep-like, low-token).',
			tags: ['search', 'lazy'],
			register: async (server) => {
				server.registerTool(
					`${prefix}_search`,
					{
						description:
							'Search the workspace text files and return matching {file,line,text} hits. `query` is a substring by default, or a JS regex with regex:true. Narrow by path with `include`/`exclude` globs (e.g. "src/**/*.ts"). Pass `context: N` (0-10) for N lines before/after each hit. Pass `preferRg: true` to use the `rg` (ripgrep) binary when available — faster on huge repos; silently falls back to the built-in walker otherwise (see `usedRg`/`rgFallbackReason`). Low-token: results and per-line previews are capped. When `detail` is omitted the tool preserves the legacy payload; `compact` removes providers and hit rows, `normal` keeps hit lines without surrounding context, and `full` returns the full context blocks.',
						inputSchema: SearchInputSchema,
						outputSchema: SearchOutputSchema,
					},
					async (args: {
						query: string;
						detail?: Detail | undefined;
						mode?: 'lexical' | 'semantic' | 'hybrid' | undefined;
						consent?: boolean | undefined;
						providerId?: IEmbedProviderId | undefined;
						roots?: string[] | undefined;
						maxResults?: number | undefined;
						caseSensitive?: boolean | undefined;
						regex?: boolean | undefined;
						include?: string[] | undefined;
						exclude?: string[] | undefined;
						context?: number | undefined;
						preferRg?: boolean | undefined;
					}) => {
						const parsed = SearchInputSchema.safeParse(args);
						if (!parsed.success) {
							return toolError(
								parsed.error.message,
								'Pass query plus optional detail, filters and context within 0..10.',
							);
						}
						try {
							const result = await runSearchWithMode(
								{
									query: parsed.data.query,
									...(parsed.data.mode !== undefined
										? { mode: parsed.data.mode }
										: {}),
									...(parsed.data.consent !== undefined
										? { consent: parsed.data.consent }
										: {}),
									...(parsed.data.providerId !== undefined
										? { providerId: parsed.data.providerId }
										: {}),
									...(parsed.data.roots !== undefined
										? { roots: parsed.data.roots }
										: {}),
									...(parsed.data.maxResults !== undefined
										? { maxResults: parsed.data.maxResults }
										: {}),
									...(parsed.data.caseSensitive !== undefined
										? {
												caseSensitive:
													parsed.data.caseSensitive,
											}
										: {}),
									...(parsed.data.regex !== undefined
										? { regex: parsed.data.regex }
										: {}),
									...(parsed.data.include !== undefined
										? { include: parsed.data.include }
										: {}),
									...(parsed.data.exclude !== undefined
										? { exclude: parsed.data.exclude }
										: {}),
									...(parsed.data.context !== undefined
										? { context: parsed.data.context }
										: {}),
									...(parsed.data.preferRg !== undefined
										? { preferRg: parsed.data.preferRg }
										: {}),
								},
								{
									workspaceRootAbs: options.workspaceRootAbs,
									defaults,
									...(options.cacheDir !== undefined
										? { cacheDir: options.cacheDir }
										: {}),
									...(options.pluginCacheDir !== undefined
										? {
												pluginCacheDir:
													options.pluginCacheDir,
											}
										: {}),
									...(options.embedder !== undefined
										? { embedder: options.embedder }
										: {}),
									...(options.env !== undefined
										? { env: options.env }
										: {}),
									...(options.fetch !== undefined
										? { fetch: options.fetch }
										: {}),
									...(options.hybridWeights !== undefined
										? {
												hybridWeights:
													options.hybridWeights,
											}
										: {}),
								},
							);
							const payload: SearchPayload = {
								query: result.query,
								count: result.hits.length,
								truncated: result.truncated,
								scanned: result.scanned,
								usedRg: result.usedRg,
								availableProviders,
								...(result.rgFallbackReason !== undefined
									? {
											rgFallbackReason:
												result.rgFallbackReason,
										}
									: {}),
								...(result.diagnostic !== undefined
									? { diagnostic: result.diagnostic }
									: {}),
								hits: result.hits,
							};
							if (parsed.data.detail === undefined) {
								return toolJson(payload);
							}
							return toolJson({
								detail: parsed.data.detail,
								...projectSearchPayload(
									payload,
									parsed.data.detail,
								),
							});
						} catch (err) {
							if (err instanceof InvalidSearchPatternError) {
								return toolError(
									err.message,
									'Fix the regex or drop regex:true to search literally.',
								);
							}
							throw err;
						}
					},
				);
			},
		},
	];
};

import { z } from 'zod';

import type { IToolRegistration } from '@mcp-vertex/core/public';
import { toolError, toolJson } from '@mcp-vertex/core/public';

import {
	InvalidSearchPatternError,
	searchWorkspace,
} from '../services/search-engine.service';
import type { ISearchOptions } from '../services/search-engine.service';

export interface ISearchToolOptions {
	readonly namespacePrefix: string;
	/** Absolute workspace root the engine walks. */
	readonly workspaceRootAbs: string;
	/** Host defaults (roots/extensions/ignoreDirs/maxResults) from config. */
	readonly defaults?: ISearchOptions;
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
							'Search the workspace text files and return matching {file,line,text} hits. `query` is a substring by default, or a JS regex with regex:true. Narrow by path with `include`/`exclude` globs (e.g. "src/**/*.ts"). Pass `context: N` (0-10) for N lines before/after each hit. Pass `preferRg: true` to use the `rg` (ripgrep) binary when available — faster on huge repos; silently falls back to the built-in walker otherwise (see `usedRg`/`rgFallbackReason`). Low-token: results and per-line previews are capped.',
						inputSchema: z.object({
							query: z.string(),
							roots: z.array(z.string()).optional(),
							maxResults: z.number().optional(),
							caseSensitive: z.boolean().optional(),
							regex: z.boolean().optional(),
							include: z.array(z.string()).optional(),
							exclude: z.array(z.string()).optional(),
							context: z.number().int().min(0).max(10).optional(),
							preferRg: z.boolean().optional(),
						}),
						outputSchema: z.object({
							query: z.string(),
							count: z.number(),
							truncated: z.boolean(),
							scanned: z.number(),
							usedRg: z.boolean(),
							rgFallbackReason: z.string().optional(),
							hits: z.array(
								z.object({
									file: z.string(),
									line: z.number(),
									text: z.string(),
									before: z.array(z.string()).optional(),
									after: z.array(z.string()).optional(),
								}),
							),
						}),
					},
					async (args: {
						query: string;
						roots?: string[] | undefined;
						maxResults?: number | undefined;
						caseSensitive?: boolean | undefined;
						regex?: boolean | undefined;
						include?: string[] | undefined;
						exclude?: string[] | undefined;
						context?: number | undefined;
						preferRg?: boolean | undefined;
					}) => {
						try {
							const result = await searchWorkspace(
								options.workspaceRootAbs,
								args.query,
								{
									...defaults,
									...(args.roots
										? { roots: args.roots }
										: {}),
									...(args.maxResults !== undefined
										? { maxResults: args.maxResults }
										: {}),
									...(args.caseSensitive !== undefined
										? { caseSensitive: args.caseSensitive }
										: {}),
									...(args.regex !== undefined
										? { regex: args.regex }
										: {}),
									...(args.include
										? { include: args.include }
										: {}),
									...(args.exclude
										? { exclude: args.exclude }
										: {}),
									...(args.context !== undefined
										? { context: args.context }
										: {}),
									...(args.preferRg !== undefined
										? { preferRg: args.preferRg }
										: {}),
								},
							);
							return toolJson({
								query: result.query,
								count: result.hits.length,
								truncated: result.truncated,
								scanned: result.scanned,
								usedRg: result.usedRg,
								...(result.rgFallbackReason !== undefined
									? {
											rgFallbackReason:
												result.rgFallbackReason,
										}
									: {}),
								hits: result.hits,
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

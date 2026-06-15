import { z } from 'zod';

import type { IToolRegistration } from '@cartago-git/mcp-core/public';
import { toolJson } from '@cartago-git/mcp-core/public';

import { searchWorkspace } from './engine';
import type { ISearchOptions } from './engine';

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
	options: ISearchToolOptions
): readonly IToolRegistration[] => {
	const prefix = options.namespacePrefix;
	const defaults = options.defaults ?? {};
	return [
		{
			id: 'search',
			summary: 'Search workspace text files for a query (grep-like, low-token).',
			tags: ['search', 'lazy'],
			register: async (server) => {
				server.registerTool(
					`${prefix}_search`,
					{
						description:
							'Search the workspace text files for a substring and return matching {file,line,text} hits. Low-token: results and per-line previews are capped. Use to locate code, proposals or notes without reading whole files.',
						inputSchema: z.object({
							query: z.string(),
							roots: z.array(z.string()).optional(),
							maxResults: z.number().optional(),
							caseSensitive: z.boolean().optional(),
						}),
					},
					async (args: {
						query: string;
						roots?: string[] | undefined;
						maxResults?: number | undefined;
						caseSensitive?: boolean | undefined;
					}) => {
						const result = searchWorkspace(
							options.workspaceRootAbs,
							args.query,
							{
								...defaults,
								...(args.roots ? { roots: args.roots } : {}),
								...(args.maxResults !== undefined
									? { maxResults: args.maxResults }
									: {}),
								...(args.caseSensitive !== undefined
									? { caseSensitive: args.caseSensitive }
									: {}),
							}
						);
						return toolJson({
							query: result.query,
							count: result.hits.length,
							truncated: result.truncated,
							scanned: result.scanned,
							hits: result.hits,
						});
					}
				);
			},
		},
	];
};

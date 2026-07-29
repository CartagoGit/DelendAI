/**
 * plugin-search.tool.ts — f00141/S3 plugin registry search tool.
 *
 * Exposes `<prefix>_plugin_search` as a pure MCP browse surface over
 * `resolvePlugins`, mirroring the registry resolver's query semantics.
 * No fs, no network, no config writes: this only shapes filtered data.
 */
import z from 'zod';

import type {
	IResolvePluginsOptions,
	IResolvePluginsResult,
	IToolRegistration,
} from '@mcp-vertex/core/public';
import { toolJson } from '@mcp-vertex/core/public';

import { resolvePlugins } from '../registry/resolve';

export interface IPluginSearchToolOptions {
	readonly namespacePrefix: string;
	/** Injected resolver; defaults to `resolvePlugins` from core. */
	readonly resolve?: (opts: IResolvePluginsOptions) => IResolvePluginsResult;
}

const SEARCH_OUTPUT = z.object({
	total: z.number(),
	truncated: z.boolean(),
	entries: z.array(
		z.object({
			id: z.string(),
			package: z.string(),
			summary: z.string(),
			tags: z.array(z.string()),
			origin: z.enum(['first-party', 'community']),
			defaultPreset: z.string().optional(),
		}),
	),
});

export const buildPluginSearchRegistration = (
	options: IPluginSearchToolOptions,
): IToolRegistration => ({
	id: 'plugin_search',
	summary:
		'Search the plugin registry by query, tag, origin, and limit. Pure browse surface over the resolver.',
	tags: ['plugin', 'registry', 'search'],
	register: async (server) => {
		server.registerTool(
			`${options.namespacePrefix}_plugin_search`,
			{
				description:
					'Search the plugin registry by free-text query, single tag, origin, and limit. Returns matching entries with id, package, summary, tags, origin, and default preset.',
				inputSchema: z.object({
					query: z.string().optional(),
					tag: z.string().optional(),
					origin: z.enum(['first-party', 'community']).optional(),
					limit: z.number().int().min(1).max(100).optional(),
				}),
				outputSchema: SEARCH_OUTPUT,
			},
			async (args: {
				query?: string | undefined;
				tag?: string | undefined;
				origin?: 'first-party' | 'community' | undefined;
				limit?: number | undefined;
			}) => {
				const runResolve = options.resolve ?? resolvePlugins;
				const result = runResolve({
					...(args.query !== undefined ? { query: args.query } : {}),
					...(args.tag !== undefined ? { tags: [args.tag] } : {}),
					...(args.origin !== undefined
						? { origin: args.origin }
						: {}),
					...(args.limit !== undefined ? { limit: args.limit } : {}),
				});

				return toolJson({
					total: result.total,
					truncated: result.truncated,
					entries: result.entries.map((entry) => ({
						id: entry.id,
						package: entry.package,
						summary: entry.summary,
						tags: [...entry.tags],
						origin: entry.origin,
						...(entry.defaultPreset !== undefined
							? { defaultPreset: entry.defaultPreset }
							: {}),
					})),
				});
			},
		);
	},
});

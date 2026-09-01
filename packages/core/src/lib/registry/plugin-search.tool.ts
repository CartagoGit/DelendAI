/**
 * plugin-search.tool.ts — f00141 S3: `<prefix>_plugin_search` MCP tool.
 *
 * Composes `resolvePlugins` for the given query and returns the
 * matching entries. The tool is **planning-only**: no fs, no network,
 * no config write. Same shape as `plugin_add`'s planner — the agent
 * discovers, then decides whether to call `plugin_add`.
 */
import z from 'zod';

import type { IToolRegistration } from '@mcp-vertex/core/public';
import { toolJson } from '@mcp-vertex/core/public';
import { resolvePlugins } from './resolve';
import type {
	IPluginRegistrySource,
	IResolvePluginsOptions,
} from '../contracts/interfaces/plugin-registry.interface';

export interface IPluginSearchToolOptions {
	readonly namespacePrefix: string;
	/** Community sources injected from committed config; first-party stays the resolver fallback. */
	readonly sources?: readonly IPluginRegistrySource[];
	/** Default limit; overrides the resolver's default of 50. */
	readonly defaultLimit?: number;
}

const ENTRY = z.object({
	id: z.string(),
	package: z.string(),
	summary: z.string(),
	tags: z.array(z.string()),
	origin: z.enum(['first-party', 'community']),
	defaultPreset: z
		.enum(['minimal', 'lean', 'standard', 'swarm', 'full', 'vertex'])
		.optional(),
});

const SEARCH_OUTPUT = z.object({
	entries: z.array(ENTRY),
	total: z.number(),
	truncated: z.boolean(),
});

export const buildPluginSearchRegistration = (
	options: IPluginSearchToolOptions,
): IToolRegistration => ({
	id: 'plugin_search',
	summary:
		'Search the plugin registry (first-party index + opt-in community sources). Pure: no fs, no network.',
	tags: ['plugin', 'registry', 'search'],
	register: async (server) => {
		server.registerTool(
			`${options.namespacePrefix}_plugin_search`,
			{
				description:
					'Search the plugin registry by free-text query, tags, origin, or limit. Returns the matching entries with id, package, summary, tags, origin, and default preset. Pure: no fs, no network, no config write.',
				inputSchema: z.object({
					query: z.string().optional(),
					tags: z.array(z.string()).optional(),
					origin: z.enum(['first-party', 'community']).optional(),
					limit: z.number().int().positive().optional(),
				}),
				outputSchema: SEARCH_OUTPUT,
			},
			async (args: {
				query?: string | undefined;
				tags?: readonly string[] | undefined;
				origin?: 'first-party' | 'community' | undefined;
				limit?: number | undefined;
			}) => {
				const resolveOptions: IResolvePluginsOptions = {
					...(options.sources !== undefined
						? { sources: options.sources }
						: {}),
					...(args.query !== undefined ? { query: args.query } : {}),
					...(args.tags !== undefined ? { tags: args.tags } : {}),
					...(args.origin !== undefined
						? { origin: args.origin }
						: {}),
					...(args.limit !== undefined
						? { limit: args.limit }
						: options.defaultLimit !== undefined
							? { limit: options.defaultLimit }
							: {}),
				};
				return toolJson(resolvePlugins(resolveOptions));
			},
		);
	},
});

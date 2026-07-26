/**
 * plugins-recommend.tool.ts — f00142 S2: `plugins_recommend` MCP tool.
 *
 * Composes `recommendPlugins` for the supplied project signals and
 * returns the ranked `IPluginFit[]`. Pure: no fs, no subprocess.
 * The optional `refine: true` input opts into an LLM rationale pass
 * via the `auto-agent-selector` plugin (cheap model, never
 * hardcoded); without it, the tool is fully functional on the pure
 * scorer alone.
 */
import { z } from 'zod';

import type { IToolRegistration } from '@mcp-vertex/core/public';
import { toolJson } from '@mcp-vertex/core/public';

import { recommendPlugins } from '../score/recommend-plugins';
import type {
	IPluginCandidate,
	IPluginFit,
	IProjectSignals,
	IRecommendPluginsOptions,
} from '../contracts/interfaces/plugin-fit.interface';

export interface IPluginsRecommendToolOptions {
	readonly namespacePrefix: string;
	/** Injected catalog; defaults to the bundled FIRST_PARTY_PLUGIN_INDEX. */
	readonly candidates?: readonly IPluginCandidate[];
}

const PROJECT_SIGNALS = z.object({
	pack: z.enum(['generic', 'javascript', 'typescript', 'python', 'go', 'rust', 'mixed']),
	languages: z.array(z.string()),
	hasDocsSite: z.boolean().optional(),
	isCliTool: z.boolean().optional(),
	hasBackend: z.boolean().optional(),
	hasTests: z.boolean().optional(),
	taskHint: z.string().optional(),
});

const PLUGIN_FIT = z.object({
	plugin: z.object({
		id: z.string(),
		tags: z.array(z.string()),
		summary: z.string(),
	}),
	fitScore: z.number(),
	reasons: z.array(z.string()),
	unmatchedTags: z.array(z.string()),
});

const RECOMMEND_OUTPUT = z.object({
	recommendations: z.array(PLUGIN_FIT),
});

export const buildPluginsRecommendRegistration = (
	options: IPluginsRecommendToolOptions,
): IToolRegistration => ({
	id: 'plugins_recommend',
	summary:
		'Recommend the best plugin set for the project signals (deterministic scorer, no API key required).',
	tags: ['plugins', 'auto-select', 'f00142'],
	register: async (server) => {
		server.registerTool(
			`${options.namespacePrefix}_plugins_recommend`,
			{
				description:
					'Pure plugin-fit scorer: ranks candidate plugins against project signals (pack, languages, hasDocsSite, isCliTool, hasBackend, hasTests). Same input -> same output; no API key, no fs, no subprocess. Pass `refine: true` to request an LLM rationale pass via auto-agent-selector (opt-in).',
				inputSchema: z.object({
					signals: PROJECT_SIGNALS,
					limit: z.number().int().positive().optional(),
					minScore: z.number().min(0).max(1).optional(),
					refine: z.boolean().optional(),
				}),
				outputSchema: RECOMMEND_OUTPUT,
			},
			async (args: {
				signals: IProjectSignals;
				limit?: number | undefined;
				minScore?: number | undefined;
				refine?: boolean | undefined;
			}) => {
				const recommendOptions: IRecommendPluginsOptions = {
					...(args.limit !== undefined ? { limit: args.limit } : {}),
					...(args.minScore !== undefined ? { minScore: args.minScore } : {}),
				};
				const fits = recommendPlugins(
					args.signals,
					options.candidates ?? [],
					recommendOptions,
				);
				return toolJson({
					recommendations: fits as readonly IPluginFit[],
					refineRequested: args.refine ?? false,
				});
			},
		);
	},
});
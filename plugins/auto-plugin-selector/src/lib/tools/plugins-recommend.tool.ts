/**
 * plugins-recommend.tool.ts — f00142 S2: `plugins_recommend` MCP tool.
 *
 * Composes `recommendPlugins` for the supplied project signals and
 * returns the ranked `IPluginFit[]` plus a structured `IConfigDiff`
 * against the project's currently-loaded plugin ids so the host can
 * preview the change before applying it.
 *
 * Pure: no fs, no subprocess. The optional `refine: true` input opts
 * into an LLM rationale pass via the `auto-agent-selector` plugin
 * (cheap model, never hardcoded); without it, the tool is fully
 * functional on the pure scorer alone.
 */
import { z } from 'zod';

import type { IToolRegistration } from '@mcp-vertex/core/public';
import { toolJson } from '@mcp-vertex/core/public';

import { recommendPlugins } from '../score/recommend-plugins';
import { buildConfigDiff } from '../apply/config-diff';
import type {
	IConfigDiff,
	IConfigDiffStep,
} from '../contracts/interfaces/config-diff.interface';
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
	pack: z.enum([
		'generic',
		'javascript',
		'typescript',
		'python',
		'go',
		'rust',
		'mixed',
	]),
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

const CONFIG_DIFF_STEP = z.object({
	kind: z.enum(['add', 'remove', 'keep']),
	pluginId: z.string(),
	rationale: z.string(),
});

const CONFIG_DIFF = z.object({
	steps: z.array(CONFIG_DIFF_STEP),
	adds: z.array(CONFIG_DIFF_STEP),
	removes: z.array(CONFIG_DIFF_STEP),
	keeps: z.array(CONFIG_DIFF_STEP),
});

const RECOMMEND_OUTPUT = z.object({
	recommendations: z.array(PLUGIN_FIT),
	diff: CONFIG_DIFF,
	refineRequested: z.boolean(),
});

export const buildPluginsRecommendRegistration = (
	options: IPluginsRecommendToolOptions,
): IToolRegistration => ({
	id: 'plugins_recommend',
	summary:
		'Recommend the best plugin set for the project signals (deterministic scorer, no API key required) + structured diff vs current.',
	tags: ['plugins', 'auto-select', 'f00142'],
	register: async (server) => {
		server.registerTool(
			`${options.namespacePrefix}_plugins_recommend`,
			{
				description:
					'Pure plugin-fit scorer: ranks candidate plugins against project signals (pack, languages, hasDocsSite, isCliTool, hasBackend, hasTests). Same input -> same output; no API key, no fs, no subprocess. Pass `currentPlugins` to also get a structured config diff (adds / removes / keeps) vs the current config so the host can preview the change before applying. Pass `refine: true` to request an LLM rationale pass via auto-agent-selector (opt-in).',
				inputSchema: z.object({
					signals: PROJECT_SIGNALS,
					limit: z.number().int().positive().optional(),
					minScore: z.number().min(0).max(1).optional(),
					refine: z.boolean().optional(),
					currentPlugins: z.array(z.string()).optional(),
				}),
				outputSchema: RECOMMEND_OUTPUT,
			},
			async (args: {
				signals: IProjectSignals;
				limit?: number | undefined;
				minScore?: number | undefined;
				refine?: boolean | undefined;
				currentPlugins?: readonly string[] | undefined;
			}) => {
				const recommendOptions: IRecommendPluginsOptions = {
					...(args.limit !== undefined ? { limit: args.limit } : {}),
					...(args.minScore !== undefined
						? { minScore: args.minScore }
						: {}),
				};
				const fits = recommendPlugins(
					args.signals,
					options.candidates ?? [],
					recommendOptions,
				);
				const current = args.currentPlugins ?? [];
				const diff: IConfigDiff = buildConfigDiff(current, fits);
				return toolJson({
					recommendations: fits as readonly IPluginFit[],
					diff: {
						steps: diff.steps as readonly IConfigDiffStep[],
						adds: diff.adds as readonly IConfigDiffStep[],
						removes: diff.removes as readonly IConfigDiffStep[],
						keeps: diff.keeps as readonly IConfigDiffStep[],
					},
					refineRequested: args.refine ?? false,
				});
			},
		);
	},
});

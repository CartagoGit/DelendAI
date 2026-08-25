/**
 * plugins-recommend.tool.ts — f00142 S2 + S3: `plugins_recommend` MCP tool.
 *
 * Composes `recommendPlugins` for the supplied project signals and
 * returns the ranked `IPluginFit[]` plus a structured `IConfigDiff`
 * against the project's currently-loaded plugin ids so the host can
 * preview the change before applying it. When `refine: true` is
 * passed AND a provider roster is supplied (typically injected by the
 * host via `auto-agent-selector`'s `discoverRoster`), the tool also
 * returns an `ILlmRationaleDecision` so the host can hand a
 * deterministic prompt to the cheapest-capable reachable LLM.
 *
 * Pure: no fs, no subprocess. The host wires I/O.
 */
import z from 'zod';

import type { IToolRegistration } from '@mcp-vertex/core/public';
import { toolJson } from '@mcp-vertex/core/public';

import { recommendPlugins } from '../score/recommend-plugins';
import { buildConfigDiff } from '../apply/config-diff';
import { buildLlmRationale } from '../refine/llm-rationale';
import type {
	IConfigDiff,
	IConfigDiffStep,
} from '../contracts/interfaces/config-diff.interface';
import type {
	IPluginCandidate,
	IPluginFit,
	IProjectSignals,
	IRecommendPluginsOptions,
	IRecommendPluginsWeights,
	IUsageAggregation,
} from '../contracts/interfaces/plugin-fit.interface';
import type { IProviderCandidate } from '@mcp-vertex/auto-agent-selector/public';

export interface IPluginsRecommendToolOptions {
	readonly namespacePrefix: string;
	/** Injected catalog; defaults to the bundled FIRST_PARTY_PLUGIN_INDEX. */
	readonly candidates?: readonly IPluginCandidate[];
	/** r00025 S4 — host-overridable weights for the scoring formula. */
	readonly weights?: IRecommendPluginsWeights | undefined;
	/** r00025 S2/S3 — per-plugin local usage aggregates. */
	readonly usageAggregations?:
		| ReadonlyMap<string, IUsageAggregation>
		| undefined;
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

const LLM_RATIONALE = z.object({
	reachable: z.boolean(),
	providerId: z.string().optional(),
	vendor: z.string().optional(),
	costTier: z
		.union([
			z.literal(1),
			z.literal(2),
			z.literal(3),
			z.literal(4),
			z.literal(5),
		])
		.optional(),
	rationale: z.string().optional(),
	prompt: z.string().optional(),
});

const RECOMMEND_OUTPUT = z.object({
	recommendations: z.array(PLUGIN_FIT),
	diff: CONFIG_DIFF,
	refineRequested: z.boolean(),
	llmRationale: LLM_RATIONALE.nullable(),
});

export const buildPluginsRecommendRegistration = (
	options: IPluginsRecommendToolOptions,
): IToolRegistration => ({
	id: 'plugins_recommend',
	summary:
		'Recommend the best plugin set for the project signals (deterministic scorer, no API key required) + structured diff vs current + optional LLM rationale.',
	tags: ['plugins', 'auto-select', 'f00142'],
	register: async (server) => {
		server.registerTool(
			`${options.namespacePrefix}_plugins_recommend`,
			{
				description:
					"Pure plugin-fit scorer: ranks candidate plugins against project signals (pack, languages, hasDocsSite, isCliTool, hasBackend, hasTests). Same input -> same output; no API key, no fs, no subprocess. Pass `currentPlugins` to also get a structured config diff (adds / removes / keeps) vs the current config so the host can preview the change before applying. Pass `refine: true` AND a `providerCandidates` array (typically from auto-agent-selector's discoverRoster) to get an `llmRationale` decision with a deterministic prompt for the cheapest-capable provider. Without providers, the tool still works fully on the pure scorer.",
				inputSchema: z.object({
					signals: PROJECT_SIGNALS,
					limit: z.number().int().positive().optional(),
					minScore: z.number().min(0).max(1).optional(),
					refine: z.boolean().optional(),
					currentPlugins: z.array(z.string()).optional(),
					providerCandidates: z
						.array(
							z.object({
								id: z.string(),
								label: z.string(),
								source: z.enum(['cli', 'api']),
								vendor: z.string(),
								reach: z.string(),
								costTier: z.union([
									z.literal(1),
									z.literal(2),
									z.literal(3),
									z.literal(4),
									z.literal(5),
								]),
							}),
						)
						.optional(),
					costQualityTradeoff: z.number().min(0).max(10).optional(),
				}),
				outputSchema: RECOMMEND_OUTPUT,
			},
			async (args: {
				signals: IProjectSignals;
				limit?: number | undefined;
				minScore?: number | undefined;
				refine?: boolean | undefined;
				currentPlugins?: readonly string[] | undefined;
				providerCandidates?: readonly IProviderCandidate[] | undefined;
				costQualityTradeoff?: number | undefined;
			}) => {
				const recommendOptions: IRecommendPluginsOptions = {
					...(args.limit !== undefined ? { limit: args.limit } : {}),
					...(args.minScore !== undefined
						? { minScore: args.minScore }
						: {}),
					...(options.weights === undefined
						? {}
						: { weights: options.weights }),
					...(options.usageAggregations === undefined
						? {}
						: { usageAggregations: options.usageAggregations }),
				};
				const fits = recommendPlugins(
					args.signals,
					options.candidates ?? [],
					recommendOptions,
				);
				const current = args.currentPlugins ?? [];
				const diff: IConfigDiff = buildConfigDiff(current, fits);
				const refineRequested = args.refine ?? false;
				const llmRationale = refineRequested
					? buildLlmRationale(
							args.signals,
							fits,
							args.providerCandidates ?? [],
							{
								...(args.costQualityTradeoff !== undefined
									? {
											costQualityTradeoff:
												args.costQualityTradeoff,
										}
									: {}),
							},
						)
					: null;
				return toolJson({
					recommendations: fits as readonly IPluginFit[],
					diff: {
						steps: diff.steps as readonly IConfigDiffStep[],
						adds: diff.adds as readonly IConfigDiffStep[],
						removes: diff.removes as readonly IConfigDiffStep[],
						keeps: diff.keeps as readonly IConfigDiffStep[],
					},
					refineRequested,
					llmRationale,
				});
			},
		);
	},
});

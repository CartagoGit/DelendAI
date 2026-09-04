/**
 * report.tool.ts — `<prefix>_usage_report`.
 *
 * Reads the append-only log on demand, folds it into the requested rollup
 * axis, and returns the bucketed slice plus the top-10 most expensive
 * calls (by cost, falling back to duration) for the user to inspect. No
 * PII, no message content — only the metadata already in the log.
 */
import z from 'zod';

import {
	compactOutputSchema,
	DETAIL_LEVELS,
	projectDetail,
	toolJson,
	type Detail,
	type IToolRegistration,
} from '@delendai/core/public';

import {
	bucketBy,
	computeTotals,
	readInvocations,
	withinWindow,
} from '../rollup';
import type { IInvocationRecord } from '../types';
import { summarizeLocalKpis } from '../usage-kpis.helper';

const DEFAULT_REPORT_LIMIT = 20;
const MAX_REPORT_LIMIT = 200;
const EXPENSIVE_CALL_LIMIT = 10;
const DetailSchema = z.enum(DETAIL_LEVELS);

const BucketSchema = z.object({
	key: z.string(),
	calls: z.number(),
	inputTokens: z.number(),
	outputTokens: z.number(),
	totalTokens: z.number(),
	costUsd: z.number(),
	tokensSaved: z.number(),
	savingsPercent: z.number(),
	errors: z.number(),
	autoBypassed: z.number(),
});

const ExpensiveCallSchema = z.object({
	ts: z.string(),
	plugin: z.string(),
	tool: z.string(),
	agent: z.string(),
	provider: z.string().nullable(),
	costUsd: z.number().nullable(),
	durationMs: z.number().nullable(),
	outcome: z.string(),
});

const TokenTaxSchema = z.object({
	staticSchemaBytes: z.number(),
	compactTypicalBytes: z.number(),
	p95ResponseBytes: z.number(),
	totalBytes: z.number(),
	estimated: z.boolean(),
	observedToolCount: z.number(),
	observedResponseSamples: z.number(),
	sources: z.object({
		staticSchemaBytes: z.string(),
		compactTypicalBytes: z.string(),
		p95ResponseBytes: z.string(),
	}),
});

const PluginKpiSchema = z.object({
	plugin: z.string(),
	observedCalls: z.number(),
	observedSessions: z.number(),
	tokenTax: TokenTaxSchema,
	utilityPer1kTokens: z.number(),
	kpis: z.object({
		schemaBytes: z.number(),
		invocationRatePerDay: z.number(),
		successContribution: z.number(),
		responseBytesP50: z.number().nullable(),
		responseBytesP95: z.number().nullable(),
		latencyMsP50: z.number().nullable(),
		latencyMsP95: z.number().nullable(),
		toolErrorRate: z.number(),
		pluginActivationRate: z.number().nullable(),
		dynamicActivationSavingsBytes: z.number().nullable(),
		memoryCompactionSavingsTokens: z.number(),
		contextRehydrationEffectiveness: z.number().nullable(),
		contextRehydrationEffectivenessNote: z.string().nullable(),
		privacyGateBlockedReportCount: z.number().nullable(),
		privacyGateBlockedReportCountNote: z.string().nullable(),
	}),
});

const KpisSchema = z.object({
	coldStartCostBytes: z.number(),
	coldStartCostTokens: z.number(),
	coldStartCostNote: z.string(),
	invocationRatePerDay: z.number(),
	successfulCallRate: z.number(),
	responseBytesP50: z.number().nullable(),
	responseBytesP95: z.number().nullable(),
	latencyMsP50: z.number().nullable(),
	latencyMsP95: z.number().nullable(),
	toolErrorRate: z.number(),
	averagePluginActivationRate: z.number().nullable(),
	dynamicActivationSavingsBytes: z.number().nullable(),
	memoryCompactionSavingsTokens: z.number(),
	memoryCompactionSavingsNote: z.string(),
	contextRehydrationEffectiveness: z.number().nullable(),
	contextRehydrationEffectivenessNote: z.string(),
	privacyGateBlockedReportCount: z.number().nullable(),
	privacyGateBlockedReportCountNote: z.string(),
});

const OutputSchema = z.object({
	detail: DetailSchema,
	groupBy: z.enum(['provider', 'plugin', 'agent', 'extension', 'model']),
	windowDays: z.number(),
	totals: z.object({
		calls: z.number(),
		inputTokens: z.number(),
		outputTokens: z.number(),
		totalTokens: z.number(),
		costUsd: z.number(),
		tokensSaved: z.number(),
		savingsPercent: z.number(),
		errors: z.number(),
		autoBypassed: z.number(),
	}),
	buckets: z.array(BucketSchema),
	pluginKpis: z.array(PluginKpiSchema),
	kpis: KpisSchema,
	expensiveCalls: z.array(ExpensiveCallSchema),
});

type UsageReportPayload = Omit<z.infer<typeof OutputSchema>, 'detail'>;

const projectUsageReport = (
	payload: UsageReportPayload,
	detail: Detail,
): UsageReportPayload =>
	projectDetail(
		payload,
		{
			compact: (full) => ({
				...full,
				pluginKpis: [],
				expensiveCalls: [],
			}),
			normal: (full) => full,
			full: (full) => full,
		},
		detail,
	) as UsageReportPayload;

const InputSchema = z.object({
	groupBy: z
		.enum(['provider', 'plugin', 'agent', 'extension', 'model'])
		.optional(),
	windowDays: z.number().positive().optional(),
	filter: z
		.object({
			provider: z.string().optional(),
			plugin: z.string().optional(),
			agent: z.string().optional(),
			outcome: z
				.enum(['success', 'error', 'timeout', 'fallback'])
				.optional(),
		})
		.optional(),
	sortBy: z
		.enum(['calls', 'totalTokens', 'tokensSaved', 'costUsd'])
		.optional(),
	limit: z.number().int().positive().optional(),
	detail: DetailSchema.optional(),
});

const matchesFilter = (
	record: IInvocationRecord,
	filter:
		| {
				provider?: string | undefined;
				plugin?: string | undefined;
				agent?: string | undefined;
				outcome?: string | undefined;
		  }
		| undefined,
): boolean => {
	if (!filter) return true;
	if (filter.provider && record.model?.provider !== filter.provider)
		return false;
	if (filter.plugin && record.plugin !== filter.plugin) return false;
	if (filter.agent && record.agent.id !== filter.agent) return false;
	if (filter.outcome && record.outcome !== filter.outcome) return false;
	return true;
};

export interface IReportToolOptions {
	readonly namespacePrefix: string;
	readonly invocationsPath: string;
}

export const buildReportToolRegistration = (
	options: IReportToolOptions,
): IToolRegistration => ({
	id: 'usage_report',
	tags: ['usage-tracking', 'lazy'],
	summary:
		'Report usage, cost and attributable token savings by provider, plugin, agent, extension or model.',
	descriptionKey: 'usage-tracking_usage_report',
	register: async (server) => {
		server.registerTool(
			`${options.namespacePrefix}_usage_report`,
			{
				description: `Report recorded tool usage grouped by provider, plugin, agent, extension or model. Returns spend, tokens used, attributable tokens saved and savings percent plus the top-${EXPENSIVE_CALL_LIMIT} most expensive calls. Group by \`model\` to see which LLM spent and saved what (calls with no model land in an \`unattributed\` bucket). Reads the append-only log on demand; no message content is ever recorded or returned. \`detail\` defaults to \`normal\`; \`compact\` suppresses the expensive-call list and plugin KPI breakdown while preserving totals and buckets.`,
				inputSchema: InputSchema,
				outputSchema: compactOutputSchema(),
			},
			async (args: z.infer<typeof InputSchema>) => {
				const detail = args.detail ?? 'normal';
				const groupBy = args.groupBy ?? 'provider';
				const windowDays = args.windowDays ?? 7;
				const sortBy = args.sortBy ?? 'costUsd';
				const limit = Math.max(
					1,
					Math.min(
						MAX_REPORT_LIMIT,
						args.limit ?? DEFAULT_REPORT_LIMIT,
					),
				);

				const all = await readInvocations(options.invocationsPath);
				const windowed = withinWindow(all, windowDays).filter((r) =>
					matchesFilter(r, args.filter),
				);

				const buckets = bucketBy(windowed, groupBy, sortBy).slice(
					0,
					limit,
				);

				const expensiveCalls = [...windowed]
					.sort(
						(a, b) =>
							(b.costUsd ?? 0) - (a.costUsd ?? 0) ||
							(b.durationMs ?? 0) - (a.durationMs ?? 0),
					)
					.slice(0, EXPENSIVE_CALL_LIMIT)
					.map((r) => ({
						ts: r.ts,
						plugin: r.plugin,
						tool: r.tool,
						agent: r.agent.id,
						provider: r.model?.provider ?? null,
						costUsd: r.costUsd,
						durationMs: r.durationMs,
						outcome: r.outcome,
					}));
				const localKpis = summarizeLocalKpis(windowed, windowDays);
				const payload = projectUsageReport(
					{
						groupBy,
						windowDays,
						totals: computeTotals(windowed),
						buckets,
						pluginKpis: [...localKpis.pluginKpis],
						kpis: localKpis.kpis,
						expensiveCalls,
					},
					detail,
				);

				return toolJson({
					detail,
					...payload,
				});
			},
		);
	},
});

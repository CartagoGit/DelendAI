/**
 * report.tool.ts — `<prefix>_usage_report`.
 *
 * Reads the append-only log on demand, folds it into the requested rollup
 * axis, and returns the bucketed slice plus the top-10 most expensive
 * calls (by cost, falling back to duration) for the user to inspect. No
 * PII, no message content — only the metadata already in the log.
 */
import { z } from 'zod';

import type { IToolRegistration } from '@mcp-vertex/core/public';
import { toolJson } from '@mcp-vertex/core/public';

import {
	bucketBy,
	computeTotals,
	readInvocations,
	withinWindow,
} from '../rollup';
import type { GroupByAxis, IInvocationRecord, SortBy } from '../types';

const BucketSchema = z.object({
	key: z.string(),
	calls: z.number(),
	inputTokens: z.number(),
	outputTokens: z.number(),
	totalTokens: z.number(),
	costUsd: z.number(),
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

const OutputSchema = z.object({
	groupBy: z.enum(['provider', 'plugin', 'agent', 'extension', 'model']),
	windowDays: z.number(),
	totals: z.object({
		calls: z.number(),
		inputTokens: z.number(),
		outputTokens: z.number(),
		totalTokens: z.number(),
		costUsd: z.number(),
		errors: z.number(),
		autoBypassed: z.number(),
	}),
	buckets: z.array(BucketSchema),
	expensiveCalls: z.array(ExpensiveCallSchema),
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
		'Report usage/cost grouped by provider, plugin, agent, extension or model.',
	descriptionKey: 'usage-tracking_usage_report',
	register: async (server) => {
		server.registerTool(
			`${options.namespacePrefix}_usage_report`,
			{
				description:
					'Report recorded tool usage grouped by provider, plugin, agent, extension or model. Returns a totals block, the bucketed rollup for the chosen axis, and the top-10 most expensive calls (by cost, then duration) so you can inspect spend. Group by `model` to see which LLM spent what (calls with no model land in an `unattributed` bucket). Reads the append-only log on demand; no message content is ever recorded or returned.',
				inputSchema: z.object({
					groupBy: z
						.enum([
							'provider',
							'plugin',
							'agent',
							'extension',
							'model',
						])
						.optional(),
					windowDays: z.number().positive().optional(),
					filter: z
						.object({
							provider: z.string().optional(),
							plugin: z.string().optional(),
							agent: z.string().optional(),
							outcome: z
								.enum([
									'success',
									'error',
									'timeout',
									'fallback',
								])
								.optional(),
						})
						.optional(),
					sortBy: z
						.enum(['calls', 'totalTokens', 'costUsd'])
						.optional(),
					limit: z.number().int().positive().optional(),
				}),
				outputSchema: OutputSchema,
			},
			async (args: {
				groupBy?: GroupByAxis | undefined;
				windowDays?: number | undefined;
				filter?:
					| {
							provider?: string | undefined;
							plugin?: string | undefined;
							agent?: string | undefined;
							outcome?:
								| 'success'
								| 'error'
								| 'timeout'
								| 'fallback'
								| undefined;
					  }
					| undefined;
				sortBy?: SortBy | undefined;
				limit?: number | undefined;
			}) => {
				const groupBy = args.groupBy ?? 'provider';
				const windowDays = args.windowDays ?? 7;
				const sortBy = args.sortBy ?? 'costUsd';
				const limit = Math.max(1, Math.min(200, args.limit ?? 20));

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
					.slice(0, 10)
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

				return toolJson({
					groupBy,
					windowDays,
					totals: computeTotals(windowed),
					buckets,
					expensiveCalls,
				});
			},
		);
	},
});

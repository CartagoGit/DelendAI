import {
	definePlugin,
	joinRel,
	toolJson,
	type IToolRegistration,
} from '@mcp-vertex/core/public';
import z from 'zod';

import { KpiSnapshotOutputSchema } from './lib/contracts/kpi-snapshot.schema';
import {
	buildKpiSnapshot,
	DEFAULT_KPI_MAX_BYTES,
	DEFAULT_KPI_WINDOW_DAYS,
} from './lib/services/kpi-aggregation.service';

const OptionsSchema = z
	.object({
		maxBytes: z.number().int().positive().optional(),
		windowDays: z.number().int().positive().optional(),
	})
	.strict();

const InputSchema = z
	.object({
		maxBytes: z.number().int().positive().optional(),
		windowDays: z.number().int().positive().optional(),
	})
	.strict();

const buildToolRegistrations = (options: {
	readonly namespacePrefix: string;
	readonly workspaceRootAbs: string;
	readonly cacheDir: string;
	readonly maxBytes: number;
	readonly windowDays: number;
}): IToolRegistration[] => [
	{
		id: 'project_kpis',
		tags: ['observability', 'aggregation', 'compact'],
		summary:
			'Build a bounded, versioned KPI snapshot by reusing compact project-health and usage-tracking signals.',
		register: async (server) => {
			server.registerTool(
				`${options.namespacePrefix}_project_kpis`,
				{
					description:
						'Return a versioned project KPI snapshot that reuses existing project-health and usage-tracking signals. S1 is intentionally compact: measured data stays measured, heuristics stay estimated, and missing sources are marked unavailable or not-configured explicitly.',
					inputSchema: InputSchema,
					outputSchema: KpiSnapshotOutputSchema,
				},
				async (args: {
					maxBytes?: number | undefined;
					windowDays?: number | undefined;
				}) =>
					toolJson(
						await buildKpiSnapshot({
							namespacePrefix: options.namespacePrefix,
							workspaceRootAbs: options.workspaceRootAbs,
							usageSummaryPathAbs: joinRel(
								joinRel(
									options.workspaceRootAbs,
									options.cacheDir,
								),
								'results/usage-tracking/usage-summary.json',
							),
							usageInvocationsPathAbs: joinRel(
								joinRel(
									options.workspaceRootAbs,
									options.cacheDir,
								),
								'results/usage-tracking/invocations.jsonl',
							),
							maxBytes: args.maxBytes ?? options.maxBytes,
							windowDays: args.windowDays ?? options.windowDays,
						}),
					),
			);
		},
	},
];

export default definePlugin({
	name: 'project-kpis',
	version: '0.1.0',
	describe:
		'Versioned KPI snapshot contract and bounded aggregation core across project-health and usage-tracking.',
	optionsSchema: OptionsSchema,
	register(ctx) {
		const parsed = OptionsSchema.safeParse(ctx.options ?? {});
		if (!parsed.success) {
			throw new Error(
				`project-kpis plugin rejected its options: ${parsed.error.message}`,
			);
		}
		return {
			tools: buildToolRegistrations({
				namespacePrefix: ctx.namespacePrefix,
				workspaceRootAbs: ctx.workspace.root,
				cacheDir: ctx.cacheDir,
				maxBytes: parsed.data.maxBytes ?? DEFAULT_KPI_MAX_BYTES,
				windowDays: parsed.data.windowDays ?? DEFAULT_KPI_WINDOW_DAYS,
			}),
		};
	},
});

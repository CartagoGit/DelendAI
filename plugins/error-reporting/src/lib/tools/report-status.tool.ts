import {
	toolJsonBounded,
	type IToolRegistration,
} from '@mcp-vertex/core/public';
import z from 'zod';

import type { IReportStatusToolOptions } from '../contracts/interfaces/report-status.interface';

const ReportStatusInputSchema = z.object({}).strict();

/** Cap on how many recent records `report_status` surfaces. */
const MAX_RECENT_REPORTS = 20;

const ReportStatusOutputSchema = z
	.object({
		enabled: z.boolean(),
		targetRepo: z.string(),
		labels: z.array(z.string()),
		recentReports: z.array(
			z
				.object({
					signature: z.string(),
					issueNumber: z.number().optional(),
					issueUrl: z.string().optional(),
					lastReportedAt: z.string(),
					count: z.number(),
				})
				.strict(),
		),
	})
	.strict();

/**
 * Read-only introspection of the auto-reporting state: whether it is
 * on, where it reports to, and the recent de-duplication records.
 * Lets an agent (or a human) confirm the plugin is wired without
 * waiting for a failure to happen.
 */
export const buildReportStatusRegistration = (
	options: IReportStatusToolOptions,
): IToolRegistration => ({
	id: 'report_status',
	tags: ['error-reporting', 'diagnostics'],
	summary:
		'Show the auto error-reporting state (enabled, target repo, recent reports).',
	register: async (server) => {
		server.registerTool(
			`${options.namespacePrefix}_report_status`,
			{
				description:
					'Read-only status of the automatic mcp-vertex error reporting: whether it is enabled, which repository it reports into, and the recent de-duplication records.',
				inputSchema: ReportStatusInputSchema,
				outputSchema: ReportStatusOutputSchema,
			},
			async () => {
				const recentReports = await options.store.all();
				return toolJsonBounded(
					ReportStatusOutputSchema.parse({
						enabled: options.options.enabled,
						targetRepo: options.options.targetRepo,
						labels: [...options.options.labels],
						recentReports: recentReports
							.slice()
							.sort((a, b) =>
								b.lastReportedAt.localeCompare(
									a.lastReportedAt,
								),
							)
							.slice(0, MAX_RECENT_REPORTS)
							.map((record) => ({
								signature: record.signature,
								...(record.issueNumber !== undefined
									? { issueNumber: record.issueNumber }
									: {}),
								...(record.issueUrl !== undefined
									? { issueUrl: record.issueUrl }
									: {}),
								lastReportedAt: record.lastReportedAt,
								count: record.count,
							})),
					}),
				);
			},
		);
	},
});

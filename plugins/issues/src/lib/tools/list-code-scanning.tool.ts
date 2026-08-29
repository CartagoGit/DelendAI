import z from 'zod';

import type { IToolRegistration } from '@mcp-vertex/core/public';

import type {
	ICodeScanningAlertSummary,
	IListCodeScanningArgs,
	IListCodeScanningToolOptions,
} from '../contracts';
import {
	githubClientToolError,
	githubTieredCollectionOk,
} from './github-list.tool-helpers';

const CODE_SCANNING_ALERT_SUMMARY_SCHEMA = z.object({
	number: z.number(),
	state: z.enum(['open', 'fixed', 'dismissed']),
	severity: z.enum([
		'critical',
		'high',
		'medium',
		'low',
		'warning',
		'error',
		'note',
		'none',
	]),
	rule: z.object({
		id: z.string(),
		severity: z.string(),
		description: z.string(),
		name: z.string(),
	}),
	tool: z.object({
		name: z.string(),
		version: z.string().nullable(),
	}),
	mostRecentInstance: z
		.object({
			path: z.string(),
			startLine: z.number(),
		})
		.nullable(),
	htmlUrl: z.string(),
	createdAt: z.string(),
	updatedAt: z.string(),
});

const LIST_CODE_SCANNING_OUTPUT_SCHEMA = z.object({
	ok: z.boolean(),
	error: z
		.object({ reason: z.string(), nextAction: z.string().optional() })
		.optional(),
	alerts: z.array(CODE_SCANNING_ALERT_SUMMARY_SCHEMA).optional(),
	tier: z.enum(['gh', 'rest-authed', 'rest-anon']).optional(),
});

export const runListCodeScanning = async (
	args: IListCodeScanningArgs,
	options: IListCodeScanningToolOptions,
) => {
	try {
		const result = await options.githubClient.listCodeScanningAlerts({
			...(args.state !== undefined ? { state: args.state } : {}),
			...(args.severity !== undefined ? { severity: args.severity } : {}),
			...(args.limit !== undefined ? { limit: args.limit } : {}),
		});
		return githubTieredCollectionOk(
			'alerts',
			result.alerts as ICodeScanningAlertSummary[],
			result.tier,
		);
	} catch (error) {
		return githubClientToolError(error);
	}
};

export const buildListCodeScanningRegistration = (
	options: IListCodeScanningToolOptions,
): IToolRegistration => ({
	id: 'issues_list_code_scanning',
	tags: ['issues', 'security'],
	summary:
		'List GitHub code scanning alerts for the configured repo (read-only).',
	register: async (server) => {
		server.registerTool(
			`${options.namespacePrefix}_issues_list_code_scanning`,
			{
				outputSchema: LIST_CODE_SCANNING_OUTPUT_SCHEMA,
				description:
					'REQUIRES proposals plugin. Lists GitHub code scanning alerts for the configured repo (read-only).',
				inputSchema: z.object({
					state: z.enum(['open', 'fixed', 'dismissed']).optional(),
					severity: z
						.enum([
							'critical',
							'high',
							'medium',
							'low',
							'warning',
							'error',
							'note',
							'none',
						])
						.optional(),
					limit: z.number().optional(),
				}),
			},
			async (args: IListCodeScanningArgs) =>
				runListCodeScanning(args, options),
		);
	},
});

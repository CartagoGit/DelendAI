import z from 'zod';

import type { IToolRegistration } from '@mcp-vertex/core/public';
import { toolError, toolOk } from '@mcp-vertex/core/public';

import type { ICodeScanningAlertSummary } from '../contracts';
import type { IGithubClient } from './list-issues.tool';

export interface IListCodeScanningToolOptions {
	readonly namespacePrefix: string;
	readonly githubClient: IGithubClient;
}

export interface IListCodeScanningArgs {
	readonly state?: 'open' | 'fixed' | 'dismissed' | undefined;
	readonly severity?:
		| 'critical'
		| 'high'
		| 'medium'
		| 'low'
		| 'warning'
		| 'error'
		| 'note'
		| 'none'
		| undefined;
	readonly limit?: number | undefined;
}

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
		return toolOk({
			alerts: result.alerts as ICodeScanningAlertSummary[],
			tier: result.tier,
		});
	} catch (error) {
		return toolError(
			error instanceof Error ? error.message : String(error),
			'Check repo configuration / network connectivity / gh auth status.',
		);
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

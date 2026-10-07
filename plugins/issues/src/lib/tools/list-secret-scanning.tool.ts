import z from 'zod';

import type { IToolRegistration } from '@delendai/core/public';

import type {
	IListSecretScanningArgs,
	IListSecretScanningToolOptions,
	ISecretScanningAlertSummary,
} from '../contracts';
import {
	githubClientToolError,
	githubTieredCollectionOk,
} from './github-list.tool-helpers';

const SECRET_SCANNING_ALERT_SUMMARY_SCHEMA = z.object({
	number: z.number(),
	state: z.enum(['open', 'resolved', 'unknown']),
	secretType: z.string(),
	pushProtection: z.boolean(),
	validity: z.string().nullable(),
	locationsCount: z.number(),
	htmlUrl: z.string(),
	createdAt: z.string(),
	updatedAt: z.string(),
});

const LIST_SECRET_SCANNING_OUTPUT_SCHEMA = z.object({
	ok: z.boolean(),
	error: z
		.object({ reason: z.string(), nextAction: z.string().optional() })
		.optional(),
	alerts: z.array(SECRET_SCANNING_ALERT_SUMMARY_SCHEMA).optional(),
	tier: z.enum(['gh', 'rest-authed', 'rest-anon']).optional(),
});

export const runListSecretScanning = async (
	args: IListSecretScanningArgs,
	options: IListSecretScanningToolOptions,
) => {
	try {
		const result = await options.githubClient.listSecretScanningAlerts({
			...(args.state !== undefined ? { state: args.state } : {}),
			...(args.limit !== undefined ? { limit: args.limit } : {}),
		});
		return githubTieredCollectionOk(
			'alerts',
			result.alerts as ISecretScanningAlertSummary[],
			result.tier,
		);
	} catch (error) {
		return githubClientToolError(error);
	}
};

export const buildListSecretScanningRegistration = (
	options: IListSecretScanningToolOptions,
): IToolRegistration => ({
	id: 'issues_list_secret_scanning',
	tags: ['issues', 'security'],
	summary:
		'List GitHub secret scanning alerts for the configured repo (read-only).',
	register: async (server) => {
		server.registerTool(
			`${options.namespacePrefix}_issues_list_secret_scanning`,
			{
				outputSchema: LIST_SECRET_SCANNING_OUTPUT_SCHEMA,
				description:
					'REQUIRES proposals plugin. Lists GitHub secret scanning alerts for the configured repo (read-only).',
				inputSchema: z.object({
					state: z.enum(['open', 'resolved']).optional(),
					limit: z.number().optional(),
				}),
			},
			async (args: IListSecretScanningArgs) =>
				runListSecretScanning(args, options),
		);
	},
});

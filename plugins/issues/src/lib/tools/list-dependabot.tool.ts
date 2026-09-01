import z from 'zod';

import type { IToolRegistration } from '@mcp-vertex/core/public';

import type {
	IDependabotAlertSummary,
	IListDependabotArgs,
	IListDependabotToolOptions,
} from '../contracts';
import {
	githubClientToolError,
	githubTieredCollectionOk,
} from './github-list.tool-helpers';

const DEPENDABOT_ALERT_SUMMARY_SCHEMA = z.object({
	number: z.number(),
	state: z.enum(['open', 'dismissed', 'fixed']),
	severity: z.enum(['critical', 'high', 'medium', 'low']),
	package: z.object({
		ecosystem: z.string(),
		name: z.string(),
	}),
	vuln: z.object({
		id: z.string(),
		severity: z.string(),
		summary: z.string().nullable(),
	}),
	htmlUrl: z.string(),
	createdAt: z.string(),
	updatedAt: z.string(),
});

const LIST_DEPENDABOT_OUTPUT_SCHEMA = z.object({
	ok: z.boolean(),
	error: z
		.object({ reason: z.string(), nextAction: z.string().optional() })
		.optional(),
	alerts: z.array(DEPENDABOT_ALERT_SUMMARY_SCHEMA).optional(),
	tier: z.enum(['gh', 'rest-authed', 'rest-anon']).optional(),
});

export const runListDependabot = async (
	args: IListDependabotArgs,
	options: IListDependabotToolOptions,
) => {
	try {
		const result = await options.githubClient.listDependabotAlerts({
			...(args.state !== undefined ? { state: args.state } : {}),
			...(args.severity !== undefined ? { severity: args.severity } : {}),
			...(args.limit !== undefined ? { limit: args.limit } : {}),
		});
		return githubTieredCollectionOk(
			'alerts',
			result.alerts as IDependabotAlertSummary[],
			result.tier,
		);
	} catch (error) {
		return githubClientToolError(error);
	}
};

export const buildListDependabotRegistration = (
	options: IListDependabotToolOptions,
): IToolRegistration => ({
	id: 'issues_list_dependabot',
	tags: ['issues', 'security'],
	summary:
		'List GitHub Dependabot alerts for the configured repo (read-only).',
	register: async (server) => {
		server.registerTool(
			`${options.namespacePrefix}_issues_list_dependabot`,
			{
				outputSchema: LIST_DEPENDABOT_OUTPUT_SCHEMA,
				description:
					'REQUIRES proposals plugin. Lists GitHub Dependabot alerts for the configured repo (read-only).',
				inputSchema: z.object({
					state: z.enum(['open', 'dismissed', 'fixed']).optional(),
					severity: z
						.enum(['critical', 'high', 'medium', 'low'])
						.optional(),
					limit: z.number().optional(),
				}),
			},
			async (args: IListDependabotArgs) =>
				runListDependabot(args, options),
		);
	},
});

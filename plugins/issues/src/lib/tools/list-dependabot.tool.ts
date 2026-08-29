import z from 'zod';

import type { IToolRegistration } from '@mcp-vertex/core/public';
import { toolError, toolOk } from '@mcp-vertex/core/public';

import type { IDependabotAlertSummary } from '../contracts';
import type { IGithubClient } from './list-issues.tool';

export interface IListDependabotToolOptions {
	readonly namespacePrefix: string;
	readonly githubClient: IGithubClient;
}

export interface IListDependabotArgs {
	readonly state?: 'open' | 'dismissed' | 'fixed' | undefined;
	readonly severity?: 'critical' | 'high' | 'medium' | 'low' | undefined;
	readonly limit?: number | undefined;
}

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
		return toolOk({
			alerts: result.alerts as IDependabotAlertSummary[],
			tier: result.tier,
		});
	} catch (error) {
		return toolError(
			error instanceof Error ? error.message : String(error),
			'Check repo configuration / network connectivity / gh auth status.',
		);
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

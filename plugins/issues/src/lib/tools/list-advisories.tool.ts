import z from 'zod';

import type { IToolRegistration } from '@mcp-vertex/core/public';

import type {
	IListAdvisoriesArgs,
	IListAdvisoriesToolOptions,
	ISecurityAdvisorySummary,
} from '../contracts';
import {
	githubClientToolError,
	githubTieredCollectionOk,
} from './github-list.tool-helpers';

const SECURITY_ADVISORY_SUMMARY_SCHEMA = z.object({
	ghsaId: z.string(),
	cveId: z.string().nullable(),
	summary: z.string(),
	severity: z.string(),
	state: z.string(),
	htmlUrl: z.string(),
	publishedAt: z.string().nullable(),
	updatedAt: z.string().nullable(),
});

const LIST_ADVISORIES_OUTPUT_SCHEMA = z.object({
	ok: z.boolean(),
	error: z
		.object({ reason: z.string(), nextAction: z.string().optional() })
		.optional(),
	advisories: z.array(SECURITY_ADVISORY_SUMMARY_SCHEMA).optional(),
	tier: z.enum(['gh', 'rest-authed', 'rest-anon']).optional(),
});

export const runListAdvisories = async (
	args: IListAdvisoriesArgs,
	options: IListAdvisoriesToolOptions,
) => {
	try {
		const result = await options.githubClient.listSecurityAdvisories({
			...(args.state !== undefined ? { state: args.state } : {}),
			...(args.limit !== undefined ? { limit: args.limit } : {}),
		});
		return githubTieredCollectionOk(
			'advisories',
			result.advisories as ISecurityAdvisorySummary[],
			result.tier,
		);
	} catch (error) {
		return githubClientToolError(error);
	}
};

export const buildListAdvisoriesRegistration = (
	options: IListAdvisoriesToolOptions,
): IToolRegistration => ({
	id: 'issues_list_advisories',
	tags: ['issues', 'security'],
	summary:
		'List GitHub repository security advisories for the configured repo (read-only).',
	register: async (server) => {
		server.registerTool(
			`${options.namespacePrefix}_issues_list_advisories`,
			{
				outputSchema: LIST_ADVISORIES_OUTPUT_SCHEMA,
				description:
					'REQUIRES proposals plugin. Lists GitHub repository security advisories for the configured repo (read-only).',
				inputSchema: z.object({
					state: z.string().optional(),
					limit: z.number().optional(),
				}),
			},
			async (args: IListAdvisoriesArgs) =>
				runListAdvisories(args, options),
		);
	},
});

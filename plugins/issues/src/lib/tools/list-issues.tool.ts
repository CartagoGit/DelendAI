/**
 * `<prefix>_issues_list` — lists GitHub issues for the configured repo.
 * Pure read: delegates straight to the injected `IGithubClient.listIssues`.
 * Single Responsibility: no file I/O, no scaffold concerns — those live
 * in `ingest-issue.tool.ts` / `analyze-issue.tool.ts` / `resolve-issue.tool.ts`.
 *
 * `IGithubClient` is the narrow injectable port every `issues_*` tool
 * depends on instead of importing `../github-client.ts`'s free functions
 * directly — tests hand-write a fake here without faking
 * `Bun.spawnSync`/`fetch`/`process.env`. Declared in this file (the
 * first tool that needs it) and re-imported by the other tool modules
 * so there is exactly one definition.
 */
import z from 'zod';

import type { IToolRegistration } from '@delendai/core/public';
import type { IListIssuesArgs, IListIssuesToolOptions } from '../contracts';
import type { IGithubIssueSummary } from '../contracts';

import {
	githubClientToolError,
	githubTieredCollectionOk,
} from './github-list.tool-helpers';
import { issueSummarySchema } from './issues-tool.shared';

const LIST_ISSUES_OUTPUT_SCHEMA = z.object({
	ok: z.boolean(),
	error: z
		.object({ reason: z.string(), nextAction: z.string().optional() })
		.optional(),
	issues: z.array(issueSummarySchema).optional(),
	tier: z.enum(['gh', 'rest-authed', 'rest-anon']).optional(),
});

export const runListIssues = async (
	args: IListIssuesArgs,
	options: IListIssuesToolOptions,
) => {
	try {
		const result = await options.githubClient.listIssues({
			...(args.state !== undefined ? { state: args.state } : {}),
			...(args.labels !== undefined ? { labels: args.labels } : {}),
			...(args.limit !== undefined ? { limit: args.limit } : {}),
		});
		return githubTieredCollectionOk(
			'issues',
			result.issues as IGithubIssueSummary[],
			result.tier,
		);
	} catch (error) {
		return githubClientToolError(error);
	}
};

/** Registration for `<prefix>_issues_list`. */
export const buildListIssuesRegistration = (
	options: IListIssuesToolOptions,
): IToolRegistration => ({
	id: 'issues_list',
	tags: ['issues'],
	summary: 'List GitHub issues for the configured repo (read-only).',
	register: async (server) => {
		server.registerTool(
			`${options.namespacePrefix}_issues_list`,
			{
				outputSchema: LIST_ISSUES_OUTPUT_SCHEMA,
				description:
					'REQUIRES proposals plugin. Lists GitHub issues for the configured repo (read-only).',
				inputSchema: z.object({
					state: z.enum(['open', 'closed', 'all']).optional(),
					labels: z.array(z.string()).optional(),
					limit: z.number().optional(),
				}),
			},
			async (args: IListIssuesArgs) => runListIssues(args, options),
		);
	},
});

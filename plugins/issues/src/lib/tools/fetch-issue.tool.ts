/**
 * `<prefix>_issues_fetch` — fetches one GitHub issue (detail + comments).
 * Pure read: delegates straight to the injected `IGithubClient.fetchIssue`.
 */
import { z } from 'zod';

import type { IToolRegistration } from '@mcp-vertex/core/public';
import { toolError, toolOk } from '@mcp-vertex/core/public';

import type { IGithubClient } from './list-issues.tool';

export interface IFetchIssueToolOptions {
	readonly namespacePrefix: string;
	readonly githubClient: IGithubClient;
}

export interface IFetchIssueArgs {
	readonly number: number;
}

const COMMENT_SCHEMA = z.object({
	author: z.string(),
	body: z.string(),
	createdAt: z.string(),
	url: z.string(),
});

const ISSUE_DETAIL_SCHEMA = z.object({
	number: z.number(),
	title: z.string(),
	state: z.enum(['open', 'closed']),
	labels: z.array(z.string()),
	author: z.string(),
	url: z.string(),
	createdAt: z.string(),
	updatedAt: z.string(),
	commentsCount: z.number(),
	body: z.string(),
	comments: z.array(COMMENT_SCHEMA),
});

const FETCH_ISSUE_OUTPUT_SCHEMA = z.object({
	ok: z.boolean(),
	error: z
		.object({ reason: z.string(), nextAction: z.string().optional() })
		.optional(),
	issue: ISSUE_DETAIL_SCHEMA.optional(),
	comments: z.array(COMMENT_SCHEMA).optional(),
});

export const runFetchIssue = async (
	args: IFetchIssueArgs,
	options: IFetchIssueToolOptions,
) => {
	try {
		const result = await options.githubClient.fetchIssue(args.number);
		return toolOk({ issue: result.data, comments: result.comments });
	} catch (error) {
		return toolError(
			error instanceof Error ? error.message : String(error),
			'Check the issue number / repo configuration / gh auth status.',
		);
	}
};

/** Registration for `<prefix>_issues_fetch`. */
export const buildFetchIssueRegistration = (
	options: IFetchIssueToolOptions,
): IToolRegistration => ({
	id: 'issues_fetch',
	tags: ['issues'],
	summary: 'Fetch one GitHub issue (detail + comments), read-only.',
	register: async (server) => {
		server.registerTool(
			`${options.namespacePrefix}_issues_fetch`,
			{
				outputSchema: FETCH_ISSUE_OUTPUT_SCHEMA,
				description:
					'REQUIRES proposals plugin. Fetches one GitHub issue (detail + comments), read-only.',
				inputSchema: z.object({
					number: z.number(),
				}),
			},
			async (args: IFetchIssueArgs) => runFetchIssue(args, options),
		);
	},
});

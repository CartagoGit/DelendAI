/**
 * `<prefix>_issues_fetch` — fetches one GitHub issue (detail + comments).
 * Pure read: delegates straight to the injected `IGithubClient.fetchIssue`.
 */
import z from 'zod';

import type { IToolRegistration } from '@delendai/core/public';
import { toolOk } from '@delendai/core/public';

import type { IGithubClient } from '../contracts';
import {
	issueCommentSchema,
	issueDetailSchema,
	issueNumberToolError,
} from './issues-tool.shared';

export interface IFetchIssueToolOptions {
	readonly namespacePrefix: string;
	readonly githubClient: IGithubClient;
}

export interface IFetchIssueArgs {
	readonly number: number;
}

const FETCH_ISSUE_OUTPUT_SCHEMA = z.object({
	ok: z.boolean(),
	error: z
		.object({ reason: z.string(), nextAction: z.string().optional() })
		.optional(),
	issue: issueDetailSchema.optional(),
	comments: z.array(issueCommentSchema).optional(),
});

export const runFetchIssue = async (
	args: IFetchIssueArgs,
	options: IFetchIssueToolOptions,
) => {
	try {
		const result = await options.githubClient.fetchIssue(args.number);
		return toolOk({ issue: result.data, comments: result.comments });
	} catch (error) {
		return issueNumberToolError(error);
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

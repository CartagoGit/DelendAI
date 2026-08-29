import z from 'zod';

import { toolError } from '@mcp-vertex/core/public';

export const issueCommentSchema = z.object({
	author: z.string(),
	body: z.string(),
	createdAt: z.string(),
	url: z.string(),
});

export const issueSummarySchema = z.object({
	number: z.number(),
	title: z.string(),
	state: z.enum(['open', 'closed']),
	labels: z.array(z.string()),
	author: z.string(),
	url: z.string(),
	createdAt: z.string(),
	updatedAt: z.string(),
	commentsCount: z.number(),
});

export const issueDetailSchema = issueSummarySchema.extend({
	body: z.string(),
	comments: z.array(issueCommentSchema),
});

const ISSUE_NUMBER_NEXT_ACTION =
	'Check the issue number / repo configuration / gh auth status.';

export const issueNumberToolError = (error: unknown) =>
	toolError(
		error instanceof Error ? error.message : String(error),
		ISSUE_NUMBER_NEXT_ACTION,
	);

import { z } from 'zod';

export const FORGE_PROVIDER_SCHEMA = z.enum(['github', 'gitlab']);
export const FORGE_ERROR_SCHEMA = z
	.object({ reason: z.string(), remediation: z.string().optional() })
	.strict();
export const FORGE_CI_SUMMARY_SCHEMA = z
	.object({
		total: z.number().int().nonnegative(),
		successful: z.number().int().nonnegative(),
		failed: z.number().int().nonnegative(),
		pending: z.number().int().nonnegative(),
		running: z.number().int().nonnegative(),
	})
	.strict();
export const FORGE_PR_SUMMARY_SCHEMA = z
	.object({
		number: z.number().int().nonnegative(),
		title: z.string(),
		branch: z.string(),
		url: z.string(),
		draft: z.boolean(),
		author: z.string(),
		labels: z.array(z.string()),
		ciSummary: FORGE_CI_SUMMARY_SCHEMA,
	})
	.strict();
export const FORGE_CHECK_SCHEMA = z
	.object({
		name: z.string(),
		status: z.string(),
		conclusion: z.string(),
		url: z.string(),
	})
	.strict();
export const FORGE_PR_DETAIL_SCHEMA = FORGE_PR_SUMMARY_SCHEMA.extend({
	state: z.string(),
	mergeable: z.string(),
	reviewDecision: z.string(),
	checks: z.array(FORGE_CHECK_SCHEMA),
}).strict();
export const FORGE_WORKFLOW_JOB_SCHEMA = z
	.object({
		id: z.string(),
		name: z.string(),
		status: z.string(),
		conclusion: z.string(),
		startedAt: z.string().optional(),
		completedAt: z.string().optional(),
		url: z.string().optional(),
	})
	.strict();
export const FORGE_WORKFLOW_RUN_SCHEMA = z
	.object({
		id: z.string(),
		name: z.string(),
		workflow: z.string(),
		branch: z.string(),
		status: z.string(),
		conclusion: z.string(),
		url: z.string(),
		createdAt: z.string().optional(),
		updatedAt: z.string().optional(),
		jobs: z.array(FORGE_WORKFLOW_JOB_SCHEMA),
		failingLog: z.string().optional(),
	})
	.strict();
export const FORGE_ISSUE_SUMMARY_SCHEMA = z
	.object({
		number: z.number().int().nonnegative(),
		title: z.string(),
		state: z.string(),
		url: z.string(),
		author: z.string(),
		labels: z.array(z.string()),
	})
	.strict();
export const FORGE_ISSUE_COMMENT_SCHEMA = z
	.object({
		author: z.string(),
		body: z.string(),
		createdAt: z.string().optional(),
		url: z.string().optional(),
	})
	.strict();
export const FORGE_ISSUE_DETAIL_SCHEMA = FORGE_ISSUE_SUMMARY_SCHEMA.extend({
	body: z.string(),
	comments: z.array(FORGE_ISSUE_COMMENT_SCHEMA),
}).strict();
export const FORGE_PR_LIST_INPUT_SCHEMA = z.object({}).strict();
export const FORGE_PR_SHOW_INPUT_SCHEMA = z
	.object({
		pr: z
			.union([z.string().min(1), z.number().int().positive()])
			.optional(),
	})
	.strict();
export const FORGE_CI_STATUS_INPUT_SCHEMA = z
	.object({ limit: z.number().int().positive().max(20).optional() })
	.strict();
export const FORGE_ISSUE_LIST_INPUT_SCHEMA = z
	.object({
		state: z.enum(['open', 'closed', 'all']).optional(),
		limit: z.number().int().positive().max(100).optional(),
	})
	.strict();
export const FORGE_ISSUE_SHOW_INPUT_SCHEMA = z
	.object({
		issue: z.union([z.string().min(1), z.number().int().positive()]),
	})
	.strict();
const forgeFailure = () =>
	z
		.object({
			ok: z.literal(false),
			provider: FORGE_PROVIDER_SCHEMA.optional(),
			error: FORGE_ERROR_SCHEMA,
		})
		.strict();
export const FORGE_PR_LIST_OUTPUT_SCHEMA = z.union([
	z
		.object({
			ok: z.literal(true),
			provider: FORGE_PROVIDER_SCHEMA,
			data: z.object({ prs: z.array(FORGE_PR_SUMMARY_SCHEMA) }).strict(),
		})
		.strict(),
	forgeFailure(),
]);
export const FORGE_PR_SHOW_OUTPUT_SCHEMA = z.union([
	z
		.object({
			ok: z.literal(true),
			provider: FORGE_PROVIDER_SCHEMA,
			data: z.object({ pr: FORGE_PR_DETAIL_SCHEMA }).strict(),
		})
		.strict(),
	forgeFailure(),
]);
export const FORGE_CI_STATUS_OUTPUT_SCHEMA = z.union([
	z
		.object({
			ok: z.literal(true),
			provider: FORGE_PROVIDER_SCHEMA,
			data: z
				.object({ runs: z.array(FORGE_WORKFLOW_RUN_SCHEMA) })
				.strict(),
		})
		.strict(),
	forgeFailure(),
]);
export const FORGE_ISSUE_LIST_OUTPUT_SCHEMA = z.union([
	z
		.object({
			ok: z.literal(true),
			provider: FORGE_PROVIDER_SCHEMA,
			data: z
				.object({ issues: z.array(FORGE_ISSUE_SUMMARY_SCHEMA) })
				.strict(),
		})
		.strict(),
	forgeFailure(),
]);
export const FORGE_ISSUE_SHOW_OUTPUT_SCHEMA = z.union([
	z
		.object({
			ok: z.literal(true),
			provider: FORGE_PROVIDER_SCHEMA,
			data: z.object({ issue: FORGE_ISSUE_DETAIL_SCHEMA }).strict(),
		})
		.strict(),
	forgeFailure(),
]);

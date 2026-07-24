import { z } from 'zod';

import {
	FORGE_ERROR_SCHEMA,
	FORGE_PROVIDER_SCHEMA,
} from './forge-read.constant';

export const FORGE_PR_CREATE_INPUT_SCHEMA = z
	.object({
		title: z.string().min(1),
		body: z.string().optional(),
		base: z.string().min(1).optional(),
		head: z.string().min(1).optional(),
		draft: z.boolean().optional(),
		confirm: z.boolean().optional(),
		proposalId: z.string().min(1).optional(),
	})
	.strict();

export const FORGE_PR_COMMENT_INPUT_SCHEMA = z
	.object({
		number: z.union([z.string().min(1), z.number().int().positive()]),
		body: z.string().min(1),
		confirm: z.boolean().optional(),
	})
	.strict();

export const FORGE_ISSUE_CREATE_INPUT_SCHEMA = z
	.object({
		title: z.string().min(1),
		body: z.string().optional(),
		labels: z.array(z.string().min(1)).optional(),
		confirm: z.boolean().optional(),
	})
	.strict();

export const FORGE_PR_CREATE_RESULT_SCHEMA = z
	.object({
		number: z.number().int().positive(),
		title: z.string(),
		url: z.string(),
		body: z.string(),
		draft: z.boolean(),
		base: z.string().optional(),
		head: z.string().optional(),
	})
	.strict();

export const FORGE_PR_COMMENT_RESULT_SCHEMA = z
	.object({
		number: z.number().int().positive(),
		body: z.string(),
		url: z.string().optional(),
	})
	.strict();

export const FORGE_ISSUE_CREATE_RESULT_SCHEMA = z
	.object({
		number: z.number().int().positive(),
		title: z.string(),
		url: z.string(),
		body: z.string(),
		labels: z.array(z.string()),
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

export const FORGE_PR_CREATE_OUTPUT_SCHEMA = z.union([
	z
		.object({
			ok: z.literal(true),
			provider: FORGE_PROVIDER_SCHEMA,
			data: z.object({ pr: FORGE_PR_CREATE_RESULT_SCHEMA }).strict(),
		})
		.strict(),
	forgeFailure(),
]);

export const FORGE_PR_COMMENT_OUTPUT_SCHEMA = z.union([
	z
		.object({
			ok: z.literal(true),
			provider: FORGE_PROVIDER_SCHEMA,
			data: z
				.object({ comment: FORGE_PR_COMMENT_RESULT_SCHEMA })
				.strict(),
		})
		.strict(),
	forgeFailure(),
]);

export const FORGE_ISSUE_CREATE_OUTPUT_SCHEMA = z.union([
	z
		.object({
			ok: z.literal(true),
			provider: FORGE_PROVIDER_SCHEMA,
			data: z
				.object({ issue: FORGE_ISSUE_CREATE_RESULT_SCHEMA })
				.strict(),
		})
		.strict(),
	forgeFailure(),
]);

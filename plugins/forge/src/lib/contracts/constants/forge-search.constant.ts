import { z } from 'zod';

import {
	FORGE_ERROR_SCHEMA,
	FORGE_PROVIDER_SCHEMA,
} from './forge-read.constant';

export const FORGE_SEARCH_KIND_SCHEMA = z.enum([
	'code',
	'commits',
	'issues',
	'prs',
]);

export const FORGE_SEARCH_CODE_INPUT_SCHEMA = z
	.object({
		query: z.string().min(1),
		kind: FORGE_SEARCH_KIND_SCHEMA.optional(),
		language: z.string().min(1).optional(),
		repo: z.string().min(1).optional(),
		path: z.string().min(1).optional(),
		limit: z.number().int().positive().max(50).optional(),
		page: z.number().int().positive().max(10).optional(),
	})
	.strict();

export const FORGE_CODE_SEARCH_HIT_SCHEMA = z
	.object({
		path: z.string(),
		repository: z.string(),
		url: z.string().optional(),
		fragment: z.string().optional(),
		sha: z.string().optional(),
	})
	.strict();

export const FORGE_SEARCH_RESULT_SCHEMA = z
	.object({
		ok: z.literal(true),
		provider: FORGE_PROVIDER_SCHEMA,
		hits: z.array(FORGE_CODE_SEARCH_HIT_SCHEMA),
		totalCount: z.number().int().nonnegative().optional(),
		query: z.string().optional(),
		kind: FORGE_SEARCH_KIND_SCHEMA.optional(),
	})
	.strict();

const forgeSearchFailure = () =>
	z
		.object({
			ok: z.literal(false),
			provider: FORGE_PROVIDER_SCHEMA.optional(),
			error: FORGE_ERROR_SCHEMA,
		})
		.strict();

export const FORGE_SEARCH_CODE_OUTPUT_SCHEMA = z.union([
	FORGE_SEARCH_RESULT_SCHEMA,
	forgeSearchFailure(),
]);

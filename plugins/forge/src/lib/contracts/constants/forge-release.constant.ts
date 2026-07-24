import { z } from 'zod';

import {
	FORGE_ERROR_SCHEMA,
	FORGE_PROVIDER_SCHEMA,
} from './forge-read.constant';

export const FORGE_RELEASE_INPUT_SCHEMA = z
	.object({
		tag: z.string().min(1),
		notes: z.string().min(1).optional(),
		notesFile: z.string().min(1).optional(),
		target: z.string().min(1).optional(),
		prerelease: z.boolean().optional(),
		draft: z.boolean().optional(),
		confirm: z.boolean(),
	})
	.strict()
	.refine(
		(value) => value.confirm === true,
		'forge_release requires confirm:true to actually cut the tag',
	);

export const FORGE_RELEASE_RESULT_SCHEMA = z
	.object({
		ok: z.literal(true),
		provider: FORGE_PROVIDER_SCHEMA,
		tag: z.string(),
		url: z.string(),
		title: z.string().optional(),
		draft: z.boolean().optional(),
		prerelease: z.boolean().optional(),
		target: z.string().optional(),
	})
	.strict();

const forgeReleaseFailure = () =>
	z
		.object({
			ok: z.literal(false),
			provider: FORGE_PROVIDER_SCHEMA.optional(),
			error: FORGE_ERROR_SCHEMA,
		})
		.strict();

export const FORGE_RELEASE_OUTPUT_SCHEMA = z.union([
	FORGE_RELEASE_RESULT_SCHEMA,
	forgeReleaseFailure(),
]);

import { z } from 'zod';

export const ADOPTION_MODE_SCHEMA = z.enum(['replace', 'augment', 'partial']);

export const ADOPTION_CAPABILITY_SCHEMA = z.enum([
	'tools',
	'prompts',
	'resources',
	'knowledge',
	'skills',
	'agents',
	'mcp-config',
	'proposal-workflow',
]);

export const ADOPTION_STRATEGY_INPUT_SCHEMA = z.object({
	mode: ADOPTION_MODE_SCHEMA.optional(),
	selectedCapabilities: z.array(ADOPTION_CAPABILITY_SCHEMA).min(1).optional(),
});

export const ADOPTION_STRATEGY_SCHEMA = z.object({
	mode: ADOPTION_MODE_SCHEMA,
	selectedCapabilities: z.array(ADOPTION_CAPABILITY_SCHEMA),
	operations: z.array(
		z.object({
			capability: ADOPTION_CAPABILITY_SCHEMA,
			action: z.enum(['preserve', 'merge', 'replace']),
		}),
	),
	protectedCapabilities: z.array(ADOPTION_CAPABILITY_SCHEMA),
	requiresExplicitReplacementConsent: z.boolean(),
});

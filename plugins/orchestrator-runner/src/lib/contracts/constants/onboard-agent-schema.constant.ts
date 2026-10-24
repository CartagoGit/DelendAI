/**
 * onboard-agent-schema.constant.ts — the input and output of
 * `<prefix>_onboard_agent`.
 */
import z from 'zod';

export const ONBOARD_AGENT_INPUT_SCHEMA = z.object({
	target: z
		.string()
		.min(1)
		.describe(
			'A registry id or name, a command, an executable path, or a URL.',
		),
	mode: z
		.enum(['plan', 'apply', 'prove'])
		.default('plan')
		.describe(
			'plan: look it up and draft; apply: write the declaration and page; prove: one consented prompt.',
		),
	declaration: z
		.record(z.string(), z.unknown())
		.optional()
		.describe('apply: the declaration to write (the draft, completed).'),
	consent: z
		.boolean()
		.optional()
		.describe(
			'prove: true only when the person said yes to spending one prompt.',
		),
	prompt: z.string().min(1).optional().describe('prove: the prompt to send.'),
});

export const ONBOARD_AGENT_OUTPUT_SCHEMA = z.object({
	mode: z.enum(['plan', 'apply', 'prove']),
	known: z.boolean(),
	agent: z.unknown().optional(),
	introduction: z.unknown().optional(),
	draft: z.record(z.string(), z.unknown()).optional(),
	help: z.string().optional(),
	declared: z.unknown().optional(),
	page: z.unknown().optional(),
	proof: z.unknown().optional(),
	nextAction: z.string(),
});

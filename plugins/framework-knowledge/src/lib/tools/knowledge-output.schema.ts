import z from 'zod';

import { FORCE_VALUES } from '../contracts/constants/knowledge-force.constant';

const ForceSchema = z.enum(FORCE_VALUES as [string, ...string[]]);

const ErrorSchema = z
	.object({
		reason: z.string(),
		nextAction: z.string().optional(),
		code: z.string().optional(),
	})
	.optional();

/** `framework_guidance`: the small resolved answer, never the evidence. */
export const GuidanceOutputSchema = z.object({
	ok: z.boolean(),
	error: ErrorSchema,
	status: z.enum(['resolved', 'unresolved', 'no-knowledge']).optional(),
	framework: z.string().optional(),
	version: z.string().optional(),
	topic: z.string().optional(),
	rules: z
		.array(
			z.object({
				id: z.string(),
				statement: z.string(),
				force: ForceSchema,
			}),
		)
		.optional(),
	resolution: z
		.object({
			outcome: z.enum(['resolved', 'incompatible']),
			ruleId: z.string(),
			source: z.string(),
			reason: z.string().optional(),
		})
		.optional(),
	/** Where the version and the rules were read from. */
	provenance: z
		.object({ lockEntry: z.string(), pack: z.string().optional() })
		.optional(),
	/** What the project was counted doing, when a rule can be counted. */
	convention: z
		.object({
			ruleId: z.string(),
			confidence: z.number(),
			sample: z.number(),
		})
		.optional(),
	note: z.string().optional(),
});

/** `framework_source`: the evidence behind exactly one rule. */
export const SourceOutputSchema = z.object({
	ok: z.boolean(),
	error: ErrorSchema,
	framework: z.string().optional(),
	version: z.string().optional(),
	ruleId: z.string().optional(),
	statement: z.string().optional(),
	evidence: z
		.object({ source: z.string(), retrievedAt: z.string() })
		.optional(),
});

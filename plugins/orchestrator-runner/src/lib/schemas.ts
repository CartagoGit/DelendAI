/**
 * schemas.ts — Zod `outputSchema`s for the runner's tools (rule 8).
 *
 * Mirrors the canonical core contracts (`IRoutingDecision`,
 * `IProviderHealthReport`, quota snapshot) so the MCP SDK can validate
 * every tool result's `structuredContent`. Kept in one place so the three
 * tools stay small and the shapes never drift between them.
 */
import { z } from 'zod';

import { CapabilityTagSchema, InvokeSchema, ProviderSchema } from './options';

const ModeSchema = z.enum(['plan', 'explore', 'implement', 'review']);
const CostTierSchema = z.union([
	z.literal(1),
	z.literal(2),
	z.literal(3),
	z.literal(4),
	z.literal(5),
]);
const StrategySchema = z.enum([
	'passthrough',
	'api',
	'cli',
	'mcp-tool',
	'handoff',
]);
const ScoreEntrySchema = z.object({
	provider: z.string(),
	score: z.number(),
	reasons: z.array(z.string()),
});

/** A routing decision WITHOUT nested alternates (the backup shape). */
const FlatDecisionSchema = z.object({
	strategy: StrategySchema,
	targetProvider: ProviderSchema,
	mode: ModeSchema,
	prompt: z.string(),
	invoke: InvokeSchema,
	rationale: z.string(),
	estimatedCostTier: CostTierSchema,
	alternates: z.array(z.never()).max(0),
	scoringTrace: z.array(ScoreEntrySchema),
	sessionId: z.string(),
});

export const RoutingDecisionSchema = z.object({
	strategy: StrategySchema,
	targetProvider: ProviderSchema,
	mode: ModeSchema,
	prompt: z.string(),
	invoke: InvokeSchema,
	rationale: z.string(),
	estimatedCostTier: CostTierSchema,
	alternates: z.array(FlatDecisionSchema),
	scoringTrace: z.array(ScoreEntrySchema),
	sessionId: z.string(),
});

export const AdviseRoutingOutputSchema = z.object({
	decision: RoutingDecisionSchema,
	alternates: z.array(FlatDecisionSchema),
	scoringTrace: z.array(ScoreEntrySchema),
	sessionId: z.string(),
	loopWarning: z
		.object({
			handoffPath: z.string(),
			suggestedAction: z.string(),
		})
		.optional(),
});

const InstallHintSchema = z.object({
	tool: z.string(),
	args: z.array(z.string()),
	pipeTo: z.literal('sh').optional(),
	dangerous: z.boolean(),
	caveat: z.string(),
});

const ProviderStateSchema = z.enum([
	'available',
	'quota-exceeded',
	'rate-limited',
	'unauthenticated',
	'not-installed',
	'model-unavailable',
	'error',
]);

export const ProviderHealthSchema = z.object({
	id: z.string(),
	cli: z.object({
		installed: z.boolean(),
		path: z.string().nullable(),
		version: z.string().nullable(),
	}),
	auth: z.object({
		authenticated: z.boolean().nullable(),
		tier: z.string().nullable(),
	}),
	model: z.object({
		requested: z.string(),
		available: z.boolean().nullable(),
	}),
	overall: ProviderStateSchema,
	installHint: InstallHintSchema.optional(),
});

export const HealthcheckOutputSchema = z.object({
	checkedAt: z.string(),
	providers: z.array(ProviderHealthSchema),
	summary: z.object({
		total: z.number(),
		available: z.number(),
		unavailable: z.number(),
	}),
});

const QuotaWindowSchema = z.object({
	window: z.enum(['hourly', 'weekly', 'monthly']),
	limit: z.number().nullable(),
	used: z.number().nullable(),
	resetAt: z.string().nullable(),
});

export const GetQuotaOutputSchema = z.object({
	present: z.boolean(),
	updatedAt: z.string().nullable(),
	providers: z.record(z.string(), z.array(QuotaWindowSchema)),
	note: z.string().optional(),
});

export { CapabilityTagSchema };

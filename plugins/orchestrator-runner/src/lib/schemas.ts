/**
 * schemas.ts — Zod `outputSchema`s for the runner's tools (rule 8).
 *
 * Mirrors the canonical core contracts (`IRoutingDecision`,
 * `IProviderHealthReport`, quota snapshot) so the MCP SDK can validate
 * every tool result's `structuredContent`. Kept in one place so the three
 * tools stay small and the shapes never drift between them.
 */
import z from 'zod';

import { CapabilityTagSchema, InvokeSchema, ProviderSchema } from './options';

export const ModeSchema = z.enum(['plan', 'explore', 'implement', 'review']);
export const CostTierSchema = z.union([
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

const DetectedProviderSchema = z.object({
	id: z.string(),
	cliPath: z.string().nullable(),
	version: z.string().nullable(),
	authTier: z.string().nullable(),
});

const MissingProviderSchema = z.object({
	id: z.string(),
	installHint: InstallHintSchema,
});

export const DiscoverProvidersOutputSchema = z.object({
	detected: z.array(DetectedProviderSchema),
	missing: z.array(MissingProviderSchema),
});

/** A single RFC 6902 JSON Patch `add` op (CRITICAL I13). */
const JsonPatchOpSchema = z.object({
	op: z.literal('add'),
	path: z.string(),
	value: z.unknown(),
});

export const BootstrapProvidersOutputSchema = z.object({
	detected: z.array(DetectedProviderSchema),
	missing: z.array(MissingProviderSchema),
	rosterDraftPath: z.string(),
	configPatch: z.array(JsonPatchOpSchema),
	brief: z.string(),
	note: z.string(),
});

// ─── S6: invocation, cancellation, handoff, models, provider-state ──────────

const UsageSchema = z.object({
	inputTokens: z.number(),
	outputTokens: z.number(),
	totalTokens: z.number(),
});

const InvokeResultSchema = z.object({
	text: z.string(),
	structuredContent: z.unknown().optional(),
	usage: UsageSchema.optional(),
	costUsd: z.number().optional(),
});

const TriedProviderSchema = z.object({
	provider: z.string(),
	failure: z.string(),
	at: z.string(),
});

const InvokeErrorSchema = z.object({
	code: z.enum([
		'no-providers',
		'all-providers-failed',
		'execution-disabled',
		'confirmation-required',
		'timeout-exceeded',
		'cancelled',
		'spend-limit-exceeded',
	]),
	tried: z.array(TriedProviderSchema),
	nextAvailableAt: z
		.object({ provider: z.string(), resetAt: z.string() })
		.nullable(),
	// Present only on `spend-limit-exceeded` (S7).
	scope: z.enum(['session', 'monthly']).optional(),
	limitUsd: z.number().optional(),
	observedUsd: z.number().optional(),
});

export const InvokeOutputSchema = z.object({
	decision: RoutingDecisionSchema,
	invocationId: z.string().optional(),
	result: InvokeResultSchema.optional(),
	error: InvokeErrorSchema.optional(),
	autoBypassed: z.boolean().optional(),
	userMessage: z.string().optional(),
});

export const CancelInvocationOutputSchema = z.object({
	invocationId: z.string(),
	cancelled: z.boolean(),
	note: z.string(),
});

export const FormatHandoffOutputSchema = z.object({
	kind: z.enum(['cli', 'curl', 'mcp-tool', 'passthrough', 'none']),
	command: z.string(),
	note: z.string(),
});

const ModelSummarySchema = z.object({
	id: z.string(),
	kind: z.enum(['api', 'subscription', 'cli', 'mcp-server']),
	modelId: z.string(),
	costTier: CostTierSchema,
	contextWindow: z.number(),
	strengths: z.array(CapabilityTagSchema),
	weaknesses: z.array(CapabilityTagSchema),
	state: ProviderStateSchema,
	reachable: z.boolean(),
	until: z.string().optional(),
	reason: z.string().optional(),
});

export const ListModelsOutputSchema = z.object({
	models: z.array(ModelSummarySchema),
	summary: z.object({
		total: z.number(),
		reachable: z.number(),
	}),
});

export const SetProviderStateOutputSchema = z.object({
	providerId: z.string(),
	applied: z.object({
		id: z.string(),
		state: ProviderStateSchema,
		until: z.string().optional(),
		reason: z.string().optional(),
	}),
	note: z.string(),
});

// ─── S7: advise_spend (LLM-as-cost-analyst) ────────────────────────────────

/** One grouped usage bucket, mirroring usage-tracking's `IRollupBucket`. */
const UsageBucketSchema = z.object({
	key: z.string(),
	calls: z.number(),
	inputTokens: z.number(),
	outputTokens: z.number(),
	totalTokens: z.number(),
	costUsd: z.number(),
	errors: z.number(),
	autoBypassed: z.number(),
});

/** The circuit-breaker verdict surfaced to the analyst (usage `ILimitsStatus`). */
export const LimitsStatusSchema = z.object({
	sessionSpendUsd: z.number(),
	sessionLimitUsd: z.number().nullable(),
	sessionLimitPct: z.number().nullable(),
	monthlySpendUsd: z.number(),
	monthlyLimitUsd: z.number().nullable(),
	monthlyLimitPct: z.number().nullable(),
	breached: z.enum(['session', 'monthly']).nullable(),
});

const RecommendationSchema = z.object({
	title: z.string(),
	detail: z.string(),
	riskLevel: z.enum(['low', 'medium', 'high']),
});

const SpendViewBaseSchema = z.object({
	windowDays: z.number(),
	generatedAt: z.string(),
});

const SpendCompactViewSchema = SpendViewBaseSchema.extend({
	sessionSpendUsd: z.number(),
	sessionLimitUsd: z.number().nullable(),
	monthlySpendUsd: z.number(),
	monthlyLimitUsd: z.number().nullable(),
	breached: z.enum(['session', 'monthly']).nullable(),
	topRecommendation: RecommendationSchema.nullable(),
});

const SpendNormalViewSchema = SpendCompactViewSchema.extend({
	observations: z.array(z.string()),
	recommendations: z.array(RecommendationSchema),
	topByPlugin: z.array(
		z.object({
			key: z.string(),
			totalTokens: z.number(),
			costUsd: z.number(),
		}),
	),
});

const SpendFullViewSchema = SpendViewBaseSchema.extend({
	currentState: z.object({
		byProvider: z.array(UsageBucketSchema),
		byPlugin: z.array(UsageBucketSchema),
		byAgent: z.array(UsageBucketSchema),
		byExtension: z.array(UsageBucketSchema),
		limitsStatus: LimitsStatusSchema,
	}),
	observations: z.array(z.string()),
	recommendations: z.array(RecommendationSchema),
});

export const AdviseSpendOutputSchema = z.object({
	view: z.union([
		SpendCompactViewSchema,
		SpendNormalViewSchema,
		SpendFullViewSchema,
	]),
	level: z.enum(['compact', 'normal', 'full']),
});

export { CapabilityTagSchema };

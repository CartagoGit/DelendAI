import z from 'zod';

import { toolJson, type IToolRegistration } from '@delendai/core/public';
import { PROPOSAL_ADAPTIVE_FACADE_INTENTS } from '@delendai/proposals/public';

import type {
	IAdaptiveFacadeRuntimeOptions,
	IAdaptiveFacadeToolArgs,
} from '../contracts/interfaces/adaptive-optimizer.interface';
import { buildAdaptiveFacadePayload } from '../services/adaptive-facade.service';

interface IAdaptiveFacadeToolOptions extends IAdaptiveFacadeRuntimeOptions {
	readonly namespacePrefix: string;
}

const AdaptiveFacadeIntentSchema = z.enum(PROPOSAL_ADAPTIVE_FACADE_INTENTS);

const HistoryEntrySchema = z
	.object({
		tool: z.string().trim().min(1),
		outcome: z.enum(['success', 'error', 'timeout', 'fallback']),
		totalTokens: z.number().finite().nonnegative().optional(),
		inputTokens: z.number().finite().nonnegative().optional(),
		outputTokens: z.number().finite().nonnegative().optional(),
		durationMs: z.number().finite().nonnegative().optional(),
	})
	.strict();

const CandidateMetricsSchema = z.object({
	successRate: z.number().min(0).max(1),
	tokenCost: z.number().finite().nonnegative(),
	callCount: z.number().int().positive(),
	latencyMs: z.number().finite().nonnegative(),
	sideEffectRisk: z.number().min(0).max(1),
	usedObservedHistory: z.boolean(),
});

const CandidateSchema = z.object({
	intent: AdaptiveFacadeIntentSchema,
	toolName: z.string().trim().min(1),
	plugin: z.literal('proposals'),
	effect: z.enum(['read', 'write', 'recovery']),
	summary: z.string().trim().min(1),
	metrics: CandidateMetricsSchema,
	score: z.number().min(0).max(100),
	utility: z.number().min(0).max(100),
	relevance: z.number().min(0).max(1),
	confidence: z.number().min(0).max(1),
	tokenTax: z.number().min(0).max(1),
	latencyTax: z.number().min(0).max(1),
	permissionRisk: z.number().min(0).max(1),
});

const DetailedSurfaceSchema = z.object({
	name: z.string().trim().min(1),
	plugin: z.string().trim().min(1),
	sinceVersion: z.string().trim().min(1),
	semverGuarantee: z.literal('additive-only'),
	summary: z.string().trim().min(1),
	inputSchema: z.unknown(),
	outputSchema: z.unknown(),
});

const InputSchema = z
	.object({
		intent: AdaptiveFacadeIntentSchema,
		task: z.string().trim().min(1).optional(),
		history: z.array(HistoryEntrySchema).max(250).optional(),
		maxAlternatives: z.number().int().min(1).max(10).optional(),
		maxBytes: z.number().int().positive().optional(),
	})
	.strict();

export const AdaptiveFacadeOutputSchema = z.object({
	intent: AdaptiveFacadeIntentSchema,
	preferredPath: CandidateSchema,
	alternatives: z.array(CandidateSchema),
	detailedSurface: z.array(DetailedSurfaceSchema),
	bytes: z.number().int().nonnegative(),
	truncated: z.boolean(),
});

export const runAdaptiveFacade = async (
	args: IAdaptiveFacadeToolArgs,
	_options: IAdaptiveFacadeToolOptions,
) => {
	const parsed = InputSchema.safeParse(args);
	if (!parsed.success) {
		throw new Error(parsed.error.message);
	}
	return toolJson(
		buildAdaptiveFacadePayload(parsed.data, {
			maxBytes: parsed.data.maxBytes,
		}),
	);
};

export const buildAdaptiveFacadeToolRegistration = (
	options: IAdaptiveFacadeToolOptions,
): IToolRegistration => ({
	id: 'adaptive_facade',
	tags: ['adaptive', 'compact', 'facade', 'proposals'],
	summary:
		'Route proposal intents to the preferred stable tool path using observed success, tokens, calls, latency and side-effect risk.',
	register: async (server) => {
		server.registerTool(
			`${options.namespacePrefix}_adaptive_facade`,
			{
				description:
					'Evaluate proposal intent routes (orient/plan/claim/progress/close/recover) against the stable proposals surface and return the preferred path while preserving the full detailed tool list.',
				inputSchema: InputSchema,
				outputSchema: AdaptiveFacadeOutputSchema,
			},
			async (toolArgs) => runAdaptiveFacade(toolArgs, options),
		);
	},
});

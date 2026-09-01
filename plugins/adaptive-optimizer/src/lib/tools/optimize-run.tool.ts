/** Cheap optimize_run registration + guards. Heavy signal collection lives in the service. */
import z from 'zod';

import {
	PERMISSION_CATEGORIES,
	type IToolRegistration,
	toolError,
	toolJson,
} from '@mcp-vertex/core/public';

import {
	ADAPTIVE_OPTIMIZER_MAX_CANDIDATES,
	ADAPTIVE_OPTIMIZER_MAX_PLUGIN_SET,
} from '../contracts/constants/adaptive-optimizer.constant';
import type {
	IOptimizeRunRuntimeOptions,
	IOptimizeRunToolArgs,
} from '../contracts/interfaces/adaptive-optimizer.interface';
import { buildOptimizeRunPayload } from '../services/optimize-run.service';
import { buildActivationMetricsToolRegistration } from './activation-metrics.tool';
import { buildAdaptiveFacadeToolRegistration } from './adaptive-facade.tool';
import { createActivationMetricsRegistry } from '../metrics/activation-metrics-registry';
import type { IActivationMetricsRegistry } from '../contracts/interfaces/adaptive-optimizer.interface';

interface IOptimizeRunToolOptions extends IOptimizeRunRuntimeOptions {
	readonly namespacePrefix: string;
	/** Optional — when present, every successful run records its response size for `activation_metrics`. */
	readonly activationMetricsRegistry?: IActivationMetricsRegistry;
}

/** Wire-payload byte size, matching what an MCP client actually receives. */
const responseByteSize = (payload: unknown): number =>
	Buffer.byteLength(JSON.stringify(payload), 'utf8');

const PermissionSchema = z.enum(PERMISSION_CATEGORIES);

const SignalsSchema = z.object({
	successRate: z.number().min(0).max(1).optional(),
	tokenCost: z.number().finite().nonnegative().optional(),
	latencyMs: z.number().finite().nonnegative().optional(),
	relevance: z.number().min(0).max(1).optional(),
	confidence: z.number().min(0).max(1).optional(),
	permissionRisk: z.number().finite().nonnegative().optional(),
});

const CandidateSchema = z.object({
	id: z.string().trim().min(1),
	model: z.string().trim().min(1).optional(),
	pluginSet: z
		.array(z.string().trim().min(1))
		.max(ADAPTIVE_OPTIMIZER_MAX_PLUGIN_SET)
		.optional(),
	prompt: z.string().optional(),
	toolDescription: z.string().optional(),
	permissions: z.array(PermissionSchema).optional(),
	signals: SignalsSchema.optional(),
});

const InputSchema = z.object({
	task: z.string().optional(),
	candidates: z
		.array(CandidateSchema)
		.min(1)
		.max(ADAPTIVE_OPTIMIZER_MAX_CANDIDATES),
	budget: z.number().positive(),
	consent: z.boolean(),
});

const RankedSchema = z.object({
	id: z.string(),
	score: z.number().min(0).max(100),
	utility: z.number().min(0).max(100),
	relevance: z.number().min(0).max(1),
	confidence: z.number().min(0).max(1),
	tokenTax: z.number().min(0).max(1),
	latencyTax: z.number().min(0).max(1),
	permissionRisk: z.number().min(0).max(1),
});

export const OptimizeRunOutputSchema = z.object({
	ranked: z.array(RankedSchema),
	budget: z.number().positive(),
	consent: z.boolean(),
	bytes: z.number(),
	truncated: z.boolean(),
});

export const runOptimizeRun = async (
	args: IOptimizeRunToolArgs,
	options: IOptimizeRunToolOptions,
) => {
	const parsed = InputSchema.safeParse(args);
	if (!parsed.success) {
		return toolError(
			parsed.error.message,
			'Pass candidates[], budget>0 and consent=true to rank optimization candidates.',
		);
	}
	if (parsed.data.consent !== true) {
		return toolError(
			'optimize_run requires explicit consent=true before it can evaluate candidates.',
			'Re-run with consent=true. The cheap scorer will still avoid heavy experiments unless a host wires them explicitly.',
		);
	}
	if (!(parsed.data.budget > 0)) {
		return toolError(
			'optimize_run requires budget > 0.',
			'Re-run with a positive budget so the optimizer can enforce an explicit ceiling.',
		);
	}
	const payload = await buildOptimizeRunPayload(parsed.data, options);
	options.activationMetricsRegistry?.recordActivation(
		responseByteSize(payload),
	);
	return toolJson(payload);
};

export const buildAdaptiveOptimizerToolRegistrations = (
	options: IOptimizeRunToolOptions,
): IToolRegistration[] => {
	const activationMetricsRegistry =
		options.activationMetricsRegistry ?? createActivationMetricsRegistry();
	return [
		buildAdaptiveFacadeToolRegistration({
			namespacePrefix: options.namespacePrefix,
			maxBytes: options.maxBytes,
		}),
		{
			id: 'optimize_run',
			tags: ['optimizer', 'adaptive', 'prompt', 'compact'],
			summary:
				'Rank model/plugin-set/prompt candidates with multi-objective scoring, explicit consent and explicit budget guards.',
			register: async (server) => {
				server.registerTool(
					`${options.namespacePrefix}_optimize_run`,
					{
						outputSchema: OptimizeRunOutputSchema,
						description:
							'Compute a bounded candidate ranking using a pure multi-objective scorer. The default path reuses only cheap public APIs and never launches the full eval harness or profiler capture.',
						inputSchema: InputSchema,
					},
					async (toolArgs) =>
						runOptimizeRun(toolArgs, {
							...options,
							activationMetricsRegistry,
						}),
				);
			},
		},
		// The metrics longitudinal gate expects a real
		// activation-metrics surface for this plugin; nothing backed it
		// until this tool existed.
		buildActivationMetricsToolRegistration({
			namespacePrefix: options.namespacePrefix,
			registry: activationMetricsRegistry,
		}),
	];
};

import z from 'zod';

import type { IToolRegistration } from '@delendai/core/public';
import {
	PayloadPercentileSchema,
	readMetricsSnapshot,
	toolJson,
} from '@delendai/core/public';

import type { IObsRuntimeMetricsToolOptions } from '../contracts/interfaces/observability.interface';

const RUNTIME_METRICS_INPUT = z
	.object({ reset: z.boolean().optional() })
	.strict();

const RUNTIME_METRICS_OUTPUT = z.object({
	calls: z.number().int().nonnegative(),
	responses: PayloadPercentileSchema,
});

/**
 * `obs_runtime_metrics` — per-process call count and p95 response-payload
 * size across `obs_trace` / `obs_release_health`. Read-only; pass
 * `reset:true` to zero the sample window after reading, mirroring the core
 * `metrics` tool's own reset contract.
 */
export const buildObsRuntimeMetricsToolRegistration = (
	options: IObsRuntimeMetricsToolOptions,
): IToolRegistration => ({
	id: 'obs_runtime_metrics',
	tags: ['observability', 'lazy'],
	summary:
		'Call count and p95 response-payload bytes across obs_trace/obs_release_health this process, with an explicit no-samples state.',
	register: async (server) => {
		server.registerTool(
			`${options.namespacePrefix}_obs_runtime_metrics`,
			{
				description:
					'Report how many obs_trace/obs_release_health calls this process served and the p95 response payload size in bytes. Read-only; pass reset:true to zero the sample window after reading. `responses.hasSamples` is explicit so "nothing observed yet" can never be mistaken for a zero-byte response.',
				inputSchema: RUNTIME_METRICS_INPUT,
				outputSchema: RUNTIME_METRICS_OUTPUT,
			},
			async (args: z.infer<typeof RUNTIME_METRICS_INPUT>) => {
				return toolJson(
					readMetricsSnapshot(options.registry, {
						reset: args.reset,
					}),
				);
			},
		);
	},
});

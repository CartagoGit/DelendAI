import z from 'zod';

import type { IToolRegistration } from '@mcp-vertex/core/public';
import {
	PayloadPercentileSchema,
	readMetricsSnapshot,
	toolJson,
} from '@mcp-vertex/core/public';

import type { IActivationMetricsToolOptions } from '../contracts/interfaces/adaptive-optimizer.interface';

const ACTIVATION_METRICS_INPUT = z
	.object({ reset: z.boolean().optional() })
	.strict();

const ACTIVATION_METRICS_OUTPUT = z.object({
	activations: z.number().int().nonnegative(),
	responses: PayloadPercentileSchema,
});

/**
 * `activation_metrics` — how many times `optimize_run` has been activated
 * this process, plus the p95 response-payload size in bytes. Read-only;
 * pass `reset:true` to zero the sample window after reading.
 */
export const buildActivationMetricsToolRegistration = (
	options: IActivationMetricsToolOptions,
): IToolRegistration => ({
	id: 'activation_metrics',
	tags: ['optimizer', 'adaptive', 'lazy'],
	summary:
		'optimize_run activation count and p95 response-payload bytes this process, with an explicit no-samples state.',
	register: async (server) => {
		server.registerTool(
			`${options.namespacePrefix}_activation_metrics`,
			{
				description:
					'Report how many times optimize_run has been activated this process and the p95 response payload size in bytes. Read-only; pass reset:true to zero the sample window after reading. `responses.hasSamples` is explicit so "nothing observed yet" can never be mistaken for a zero-byte response.',
				inputSchema: ACTIVATION_METRICS_INPUT,
				outputSchema: ACTIVATION_METRICS_OUTPUT,
			},
			async (args: z.infer<typeof ACTIVATION_METRICS_INPUT>) => {
				return toolJson(
					readMetricsSnapshot(options.registry, {
						reset: args.reset,
					}),
				);
			},
		);
	},
});

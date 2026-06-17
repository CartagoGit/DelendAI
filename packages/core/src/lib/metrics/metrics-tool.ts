/**
 * `<prefix>_metrics` meta-tool (M12): report the per-tool metrics collected
 * this process (calls, errors, latency, response bytes). Read-only; pass
 * `reset: true` to zero the counters after reading.
 */
import { z } from 'zod';

import { toolJson } from '../shared/tool-response';
import type { IToolRegistration } from '../contracts/interfaces/tool-registration.interface';
import type { IMetricsRegistry } from './metrics-registry';

const MetricSchema = z.object({
	calls: z.number(),
	errors: z.number(),
	totalMs: z.number(),
	maxMs: z.number(),
	totalBytes: z.number(),
});

export const buildMetricsToolRegistration = (
	namespacePrefix: string,
	registry: IMetricsRegistry
): IToolRegistration => ({
	id: 'metrics',
	summary: 'Per-tool call metrics: calls, errors, latency (ms) and response bytes.',
	tags: ['observability', 'lazy'],
	register: async (server) => {
		server.registerTool(
			`${namespacePrefix}_metrics`,
			{
				description:
					'Return per-tool metrics collected this process: calls, errors, total/max latency (ms) and response bytes, plus totals. Read-only; pass reset:true to zero the counters after reading. Quantifies tool cost (e.g. token savings of compact responses).',
				inputSchema: z.object({ reset: z.boolean().optional() }),
				outputSchema: z.object({
					tools: z.object({}).catchall(MetricSchema),
					totals: z.object({
						calls: z.number(),
						errors: z.number(),
						totalMs: z.number(),
						totalBytes: z.number(),
					}),
				}),
			},
			async (args: { reset?: boolean | undefined }) => {
				// Snapshot BEFORE an optional reset so the caller sees the data.
				const snapshot = registry.snapshot();
				if (args.reset === true) registry.reset();
				return toolJson(snapshot);
			}
		);
	},
});

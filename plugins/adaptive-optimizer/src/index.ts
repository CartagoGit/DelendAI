import { definePlugin } from '@mcp-vertex/core/public';
import z from 'zod';

import { DEFAULT_ADAPTIVE_OPTIMIZER_MAX_BYTES } from './lib/contracts/constants/adaptive-optimizer.constant';
import { buildAdaptiveOptimizerToolRegistrations } from './lib/tools/optimize-run.tool';

const OptionsSchema = z.object({
	maxBytes: z.number().int().positive().optional(),
});

export default definePlugin({
	name: 'adaptive-optimizer',
	version: '0.1.0',
	describe:
		'Cheap adaptive optimization over model, plugin-set and prompt candidates with explicit budget and consent guards.',
	optionsSchema: OptionsSchema,
	register(ctx) {
		const parsed = OptionsSchema.safeParse(ctx.options ?? {});
		if (!parsed.success) {
			throw new Error(
				`adaptive-optimizer plugin rejected its options: ${parsed.error.message}`,
			);
		}
		return {
			tools: buildAdaptiveOptimizerToolRegistrations({
				namespacePrefix: ctx.namespacePrefix,
				workspaceRootAbs: ctx.workspace.root,
				maxBytes:
					parsed.data.maxBytes ??
					DEFAULT_ADAPTIVE_OPTIMIZER_MAX_BYTES,
				...(ctx.hostIdentity?.host === undefined
					? {}
					: { hostName: ctx.hostIdentity.host }),
			}),
		};
	},
});

import { definePlugin } from '@mcp-vertex/core/public';
import z from 'zod';

import { DEFAULT_IMPACT_ANALYSIS_MAX_BYTES } from './lib/contracts/constants/impact-analysis.constant';
import { buildImpactAnalysisToolRegistrations } from './lib/tools/impact-analyze.tool';

const OptionsSchema = z.object({
	maxBytes: z.number().int().positive().optional(),
});

export default definePlugin({
	name: 'impact-analysis',
	version: '0.1.0',
	describe:
		'Bounded impact analysis and test selection across changed symbols, dependents and related specs.',
	optionsSchema: OptionsSchema,
	register(ctx) {
		const parsed = OptionsSchema.safeParse(ctx.options ?? {});
		if (!parsed.success) {
			throw new Error(
				`impact-analysis plugin rejected its options: ${parsed.error.message}`,
			);
		}
		return {
			tools: buildImpactAnalysisToolRegistrations({
				namespacePrefix: ctx.namespacePrefix,
				workspaceRootAbs: ctx.workspace.root,
				maxBytes:
					parsed.data.maxBytes ?? DEFAULT_IMPACT_ANALYSIS_MAX_BYTES,
			}),
		};
	},
});

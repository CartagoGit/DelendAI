import { definePlugin } from '@mcp-vertex/core/public';
import z from 'zod';

import {
	buildProjectKpisToolRegistrations,
	DEFAULT_KPI_MAX_BYTES,
	DEFAULT_KPI_WINDOW_DAYS,
} from './lib/tools/project-kpis.tool';

const OptionsSchema = z
	.object({
		maxBytes: z.number().int().positive().optional(),
		windowDays: z.number().int().positive().optional(),
	})
	.strict();

export default definePlugin({
	name: 'project-kpis',
	version: '0.1.0',
	describe:
		'Versioned KPI snapshot contract and bounded aggregation core across project-health and usage-tracking.',
	optionsSchema: OptionsSchema,
	register(ctx) {
		const parsed = OptionsSchema.safeParse(ctx.options ?? {});
		if (!parsed.success) {
			throw new Error(
				`project-kpis plugin rejected its options: ${parsed.error.message}`,
			);
		}
		return {
			tools: buildProjectKpisToolRegistrations({
				namespacePrefix: ctx.namespacePrefix,
				workspaceRootAbs: ctx.workspace.root,
				cacheDir: ctx.cacheDir,
				maxBytes: parsed.data.maxBytes ?? DEFAULT_KPI_MAX_BYTES,
				windowDays: parsed.data.windowDays ?? DEFAULT_KPI_WINDOW_DAYS,
			}),
		};
	},
});

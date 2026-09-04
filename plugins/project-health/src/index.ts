import { definePlugin } from '@delendai/core/public';
import z from 'zod';

import { DEFAULT_PROJECT_HEALTH_MAX_BYTES } from './lib/contracts/constants/project-health.constant';
import { buildProjectHealthToolRegistrations } from './lib/tools/project-health.tool';

const OptionsSchema = z.object({
	maxBytes: z.number().int().positive().optional(),
});

export default definePlugin({
	name: 'project-health',
	version: '0.1.0',
	describe:
		'Cheap project-health summary plus lazy detail routing across security, deps, quality and tech debt.',
	optionsSchema: OptionsSchema,
	register(ctx) {
		const parsed = OptionsSchema.safeParse(ctx.options ?? {});
		if (!parsed.success) {
			throw new Error(
				`project-health plugin rejected its options: ${parsed.error.message}`,
			);
		}
		return {
			tools: buildProjectHealthToolRegistrations({
				namespacePrefix: ctx.namespacePrefix,
				workspaceRootAbs: ctx.workspace.root,
				maxBytes:
					parsed.data.maxBytes ?? DEFAULT_PROJECT_HEALTH_MAX_BYTES,
			}),
		};
	},
});

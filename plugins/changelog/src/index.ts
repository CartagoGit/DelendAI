import { z } from 'zod';

import { definePlugin } from '@mcp-vertex/core/public';

import { buildChangelogGenerateToolRegistration } from './lib/tools/changelog-generate.tool';

const OptionsSchema = z.object({});

export default definePlugin({
	name: 'changelog',
	version: '0.1.0',
	describe:
		'Pure changelog generation from git commit ranges using conventional commit grouping (f00131 S1).',
	optionsSchema: OptionsSchema,
	register(ctx) {
		const parsed = OptionsSchema.safeParse(ctx.options ?? {});
		if (!parsed.success) {
			throw new Error(
				`changelog plugin rejected its options: ${parsed.error.message}`,
			);
		}
		return {
			// S3 (or a follow-up) will wire tsconfig/vitest/plugin-defaults/publish-order/preset-catalog.
			tools: [
				buildChangelogGenerateToolRegistration({
					namespacePrefix: ctx.namespacePrefix,
					workspaceRootAbs: ctx.workspace.root,
				}),
			],
			knowledge: [],
		};
	},
});

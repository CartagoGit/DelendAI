import { definePlugin } from '@mcp-vertex/core/public';
import z from 'zod';

import { DEFAULT_CONTEXT_FOR_CHANGE_MAX_BYTES } from './lib/contracts/constants/context-for-change.constant';
import { buildContextForChangeToolRegistrations } from './lib/tools/context-for-change.tool';

const OptionsSchema = z.object({
	maxBytes: z.number().int().positive().optional(),
	docsRoots: z.array(z.string()).optional(),
	memoryStorePath: z.string().optional(),
	testPolicyMode: z.enum(['tdd', 'tests-after', 'free', 'none']).optional(),
});

export default definePlugin({
	name: 'context-for-change',
	version: '0.1.0',
	describe:
		'Compact task-oriented context orchestration across diff, symbols, tests, docs and conventions.',
	optionsSchema: OptionsSchema,
	register(ctx) {
		const parsed = OptionsSchema.safeParse(ctx.options ?? {});
		if (!parsed.success) {
			throw new Error(
				`context-for-change plugin rejected its options: ${parsed.error.message}`,
			);
		}
		const opts = parsed.data;
		return {
			tools: buildContextForChangeToolRegistrations({
				namespacePrefix: ctx.namespacePrefix,
				workspaceRootAbs: ctx.workspace.root,
				maxBytes: opts.maxBytes ?? DEFAULT_CONTEXT_FOR_CHANGE_MAX_BYTES,
				...(opts.docsRoots !== undefined
					? { docsRoots: opts.docsRoots }
					: {}),
				...(opts.memoryStorePath !== undefined
					? { memoryStorePath: opts.memoryStorePath }
					: {}),
				...(opts.testPolicyMode !== undefined
					? { testPolicyMode: opts.testPolicyMode }
					: {}),
			}),
		};
	},
});

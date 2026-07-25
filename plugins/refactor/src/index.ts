/**
 * f00123 S1 — `refactor` plugin entry point. S1 ships navigation
 * (references / definition / symbols) only. S2 (safe rename) and S3
 * (rule-based codemods) are tracked separately under `f00123` once
 * the AST walker lands.
 */
import { z } from 'zod';

import { definePlugin } from '@mcp-vertex/core/public';

import { buildRefactorNavToolRegistrations } from './lib/tools/refactor-nav.tool';

const OptionsSchema = z.object({
	workspaceRootAbs: z.string().optional(),
});

export default definePlugin({
	name: 'refactor',
	version: '0.1.0',
	describe: 'AST-safe refactor: navigation (S1) — always dry-run-first.',
	optionsSchema: OptionsSchema,
	register(ctx) {
		const parsed = OptionsSchema.safeParse(ctx.options ?? {});
		if (!parsed.success) {
			throw new Error(
				`refactor plugin rejected its options: ${parsed.error.message}`,
			);
		}
		const opts = parsed.data;
		return {
			tools: buildRefactorNavToolRegistrations({
				namespacePrefix: ctx.namespacePrefix,
				workspaceRootAbs: opts.workspaceRootAbs ?? ctx.workspace.root,
			}),
		};
	},
});

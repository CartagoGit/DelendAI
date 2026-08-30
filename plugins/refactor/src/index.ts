/**
 * f00123 S1+S2 — `refactor` plugin entry point.
 * S1: navigation (references / definition / symbols).
 * S2: safe rename (scoped multi-file diffs + apply).
 * S3 (rule-based codemods) tracked separately under `f00123`.
 */
import z from 'zod';

import { definePlugin } from '@mcp-vertex/core/public';

import { buildRefactorNavToolRegistrations } from './lib/tools/refactor-nav.tool';
import { buildRefactorCodemodToolRegistrations } from './lib/tools/refactor-codemod.tool';
import { buildRefactorRenameToolRegistrations } from './lib/tools/refactor-rename.tool';

const OptionsSchema = z.object({
	workspaceRootAbs: z.string().optional(),
});

export default definePlugin({
	name: 'refactor',
	version: '0.1.1',
	describe:
		'AST-safe refactor: navigation (S1), rename (S2), codemods (S3) — always dry-run-first.',
	optionsSchema: OptionsSchema,
	register(ctx) {
		const parsed = OptionsSchema.safeParse(ctx.options ?? {});
		if (!parsed.success) {
			throw new Error(
				`refactor plugin rejected its options: ${parsed.error.message}`,
			);
		}
		const opts = parsed.data;
		const workspaceRoot = opts.workspaceRootAbs ?? ctx.workspace.root;
		return {
			tools: [
				...buildRefactorNavToolRegistrations({
					namespacePrefix: ctx.namespacePrefix,
					workspaceRootAbs: workspaceRoot,
				}),
				...buildRefactorCodemodToolRegistrations({
					namespacePrefix: ctx.namespacePrefix,
					workspaceRootAbs: workspaceRoot,
				}),
				...buildRefactorRenameToolRegistrations({
					namespacePrefix: ctx.namespacePrefix,
					workspaceRootAbs: workspaceRoot,
				}),
			],
		};
	},
});

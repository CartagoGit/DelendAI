/**
 * f00123 — `refactor` plugin entry point.
 *
 * S1 (navigation): `refactor_references`, `refactor_definition`, `refactor_symbols`.
 * S2 (safe rename): `refactor_rename` (planner) + `refactor_apply` (consented writer).
 * S3 (codemods): tracked separately under `f00123` once the AST walker lands.
 */
import { z } from 'zod';

import { definePlugin } from '@mcp-vertex/core/public';

import { buildRefactorCodemodToolRegistrations } from './lib/tools/refactor-codemod.tool';
import { buildRefactorNavToolRegistrations } from './lib/tools/refactor-nav.tool';
import { buildRefactorRenameToolRegistrations } from './lib/tools/refactor-rename.tool';

const OptionsSchema = z.object({
	workspaceRootAbs: z.string().optional(),
});

export default definePlugin({
	name: 'refactor',
	version: '0.1.0',
	describe:
		'AST-safe refactor: navigation (S1), safe rename (S2) — always dry-run-first.',
	optionsSchema: OptionsSchema,
	register(ctx) {
		const parsed = OptionsSchema.safeParse(ctx.options ?? {});
		if (!parsed.success) {
			throw new Error(
				`refactor plugin rejected its options: ${parsed.error.message}`,
			);
		}
		const opts = parsed.data;
		const workspaceRootAbs = opts.workspaceRootAbs ?? ctx.workspace.root;
		const shared = {
			namespacePrefix: ctx.namespacePrefix,
			workspaceRootAbs,
		};
		return {
			tools: [
				...buildRefactorCodemodToolRegistrations(shared),
				...buildRefactorNavToolRegistrations(shared),
				...buildRefactorRenameToolRegistrations(shared),
			],
		};
	},
});

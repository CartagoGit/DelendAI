/**
 * @mcp-vertex/conventions — file-convention plugin (f00037 S3).
 *
 * A consumer-facing surface over the repo's canonical file-convention
 * profile (`docs/mcp-vertex/FILE-CONVENTIONS.md`): two read-only MCP tools that
 * classify paths and report convention drift. Host-agnostic and
 * dependency-free beyond `@mcp-vertex/core` — it owns its own
 * TypeScript profile rather than importing the lint-side engine from
 * `tools/` (which a plugin must not reach into).
 *
 * Registered tools (namespaced to the plugin prefix, default
 * `conventions_*`):
 *   - `conventions_classify` — pure: classify caller-supplied paths.
 *   - `conventions_check`     — scan the workspace, report drift.
 */
import { definePlugin } from '@mcp-vertex/core/public';
import { z } from 'zod';

import { buildConventionsToolRegistrations } from './lib/tools';

export default definePlugin({
	name: 'conventions',
	version: '0.1.0',
	describe:
		'File-convention tools: classify repo paths into canonical roles and report convention drift (f00037). Read-only, host-agnostic.',
	optionsSchema: z.object({
		/**
		 * Override the default scan roots (`packages`, `plugins`,
		 * `extensions`, `apps`, `tools`). Useful to narrow `conventions_check`
		 * in a non-monorepo host.
		 */
		roots: z.array(z.string()).optional(),
	}),
	async register(ctx) {
		const roots = Array.isArray(ctx.options.roots)
			? (ctx.options.roots as string[])
			: undefined;
		return {
			tools: await buildConventionsToolRegistrations({
				namespacePrefix: ctx.namespacePrefix,
				workspaceRoot: ctx.workspace.root,
				...(roots !== undefined ? { defaultRoots: roots } : {}),
			}),
		};
	},
});

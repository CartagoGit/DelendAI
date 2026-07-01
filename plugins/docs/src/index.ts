import { definePlugin } from '@mcp-vertex/core/public';
import { z } from 'zod';

import { buildDocsToolRegistrations } from './lib/tools';
import type { IDocsOptions } from './lib/services/engine';

/**
 * Project documentation plugin. Catalogues and serves the repo's markdown
 * (`docs_list` + `docs_read`) so an agent navigates curated docs by
 * title/path without grepping. Load with `mcp-vertex --plugins=docs`.
 * Agnostic: roots/extensions are configurable via `plugins.docs.options`
 * (default roots: `docs/` + `README.md`).
 */

/**
 * r00003 S9 (F5, O + L + I): explicit zod schema for the docs plugin's
 * options. Replaces the `ctx.options as { … }` cast so a host misconfig
 * is rejected up front with a structured error.
 */
const OptionsSchema = z.object({
	roots: z.array(z.string()).optional(),
	extensions: z.array(z.string()).optional(),
	ignoreDirs: z.array(z.string()).optional(),
	maxResults: z.number().optional(),
});

export default definePlugin({
	name: 'docs',
	version: '0.1.0',
	describe:
		'Catalogue + read the project markdown docs (docs_list / docs_read), low-token curated navigation.',
	optionsSchema: OptionsSchema,
	register(ctx) {
		const parsed = OptionsSchema.safeParse(ctx.options ?? {});
		if (!parsed.success) {
			throw new Error(
				`docs plugin rejected its options: ${parsed.error.message}`,
			);
		}
		const o = parsed.data;
		const defaults: IDocsOptions = {
			...(o.roots !== undefined ? { roots: o.roots } : {}),
			...(o.extensions !== undefined ? { extensions: o.extensions } : {}),
			...(o.ignoreDirs !== undefined ? { ignoreDirs: o.ignoreDirs } : {}),
			...(o.maxResults !== undefined ? { maxResults: o.maxResults } : {}),
		};
		return {
			tools: buildDocsToolRegistrations({
				namespacePrefix: ctx.namespacePrefix,
				workspaceRootAbs: ctx.workspace.root,
				defaults,
			}),
			knowledge: [
				{
					id: 'docs-usage',
					title: 'Project documentation',
					body: [
						'# Project documentation',
						'',
						`Tools: \`${ctx.namespacePrefix}_docs_list\` (catalogue) / \`${ctx.namespacePrefix}_docs_read\` (read one).`,
						'',
						'- `docs_list` returns `{path,title}` for every markdown under the configured roots (default `docs/` + `README.md`).',
						'- `docs_read` returns one doc by its workspace-relative path; refuses paths outside the workspace.',
						'- Prefer this for curated navigation; use `search` to grep across the whole tree.',
					].join('\n'),
				},
			],
		};
	},
});

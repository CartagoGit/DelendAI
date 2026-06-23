import { definePlugin } from '@mcp-vertex/core/public';

import { buildDocsToolRegistrations } from './lib/tools';
import type { IDocsOptions } from './lib/services/engine';

/**
 * Project documentation plugin. Catalogues and serves the repo's markdown
 * (`docs_list` + `docs_read`) so an agent navigates curated docs by
 * title/path without grepping. Load with `mcp-vertex --plugins=docs`.
 * Agnostic: roots/extensions are configurable via `plugins.docs.options`
 * (default roots: `docs/` + `README.md`).
 */
export default definePlugin({
	name: 'docs',
	version: '0.1.0',
	describe:
		'Catalogue + read the project markdown docs (docs_list / docs_read), low-token curated navigation.',
	register(ctx) {
		const o = ctx.options as {
			roots?: string[];
			extensions?: string[];
			ignoreDirs?: string[];
			maxResults?: number;
		};
		const defaults: IDocsOptions = {
			...(Array.isArray(o.roots) ? { roots: o.roots } : {}),
			...(Array.isArray(o.extensions)
				? { extensions: o.extensions }
				: {}),
			...(Array.isArray(o.ignoreDirs)
				? { ignoreDirs: o.ignoreDirs }
				: {}),
			...(typeof o.maxResults === 'number'
				? { maxResults: o.maxResults }
				: {}),
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

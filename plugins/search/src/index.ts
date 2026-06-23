import { definePlugin } from '@mcp-vertex/core/public';

import { buildSearchToolRegistrations } from './lib/tools/search.tool';
import type { ISearchOptions } from './lib/services/search-engine.service';

/**
 * Textual workspace search. A grep-like `search` tool over allow-listed
 * text files, with capped output so an agent can locate code, proposals
 * or notes without reading whole files. Load with
 * `mcp-vertex --plugins=search`. Agnostic: roots/extensions/ignored dirs
 * are configurable via `plugins.search.options`.
 */
export default definePlugin({
	name: 'search',
	version: '0.1.0',
	describe:
		'Grep-like textual search over the workspace (low-token {file,line,text} hits).',
	register(ctx) {
		const opts = ctx.options as {
			roots?: string[];
			extensions?: string[];
			ignoreDirs?: string[];
			maxResults?: number;
		};
		const defaults: ISearchOptions = {
			...(Array.isArray(opts.roots) ? { roots: opts.roots } : {}),
			...(Array.isArray(opts.extensions)
				? { extensions: opts.extensions }
				: {}),
			...(Array.isArray(opts.ignoreDirs)
				? { ignoreDirs: opts.ignoreDirs }
				: {}),
			...(typeof opts.maxResults === 'number'
				? { maxResults: opts.maxResults }
				: {}),
		};
		return {
			tools: buildSearchToolRegistrations({
				namespacePrefix: ctx.namespacePrefix,
				workspaceRootAbs: ctx.workspace.root,
				defaults,
			}),
			knowledge: [
				{
					id: 'search-usage',
					title: 'Workspace search',
					body: [
						'# Workspace search',
						'',
						`Tool: \`${ctx.namespacePrefix}_search\` — grep-like substring search over text files.`,
						'',
						'- Returns `{file, line, text}` hits; result count and line previews are capped (low-token).',
						'- Narrow with `roots` (dirs relative to the workspace) and `maxResults`.',
						'- Binary/large files and dep/build dirs (node_modules, .git, dist, …) are skipped.',
						'- Prefer this over reading whole files when locating a symbol, string or proposal.',
					].join('\n'),
				},
			],
		};
	},
});

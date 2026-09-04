import { definePlugin } from '@delendai/core/public';
import z from 'zod';
import { isAbsolute } from 'node:path';

import { buildSearchToolRegistrations } from './lib/tools/search.tool';
import type { ISearchOptions } from './lib/services/search-engine.service';

/**
 * Textual workspace search. A grep-like `search` tool over allow-listed
 * text files, with capped output so an agent can locate code, proposals
 * or notes without reading whole files. Load with
 * `delendai --plugins=search`. Agnostic: roots/extensions/ignored dirs
 * are configurable via `plugins.search.options`.
 */

/**
 * r00003 S9 (F4, O + L + I): an explicit zod schema for the search
 * plugin's options. Replaces the `ctx.options as { … }` cast so a host
 * misconfig (e.g. `maxResults: "10"`) is rejected up front with a
 * structured error instead of being silently coerced.
 */
const OptionsSchema = z.object({
	roots: z.array(z.string()).optional(),
	extensions: z.array(z.string()).optional(),
	ignoreDirs: z.array(z.string()).optional(),
	maxResults: z.number().optional(),
	hybridWeights: z
		.object({
			bm25: z.number().optional(),
			vector: z.number().optional(),
		})
		.optional(),
});

export default definePlugin({
	name: 'search',
	version: '0.1.1',
	describe:
		'Grep-like textual search over the workspace (low-token {file,line,text} hits).',
	optionsSchema: OptionsSchema,
	register(ctx) {
		const parsed = OptionsSchema.safeParse(ctx.options ?? {});
		if (!parsed.success) {
			throw new Error(
				`search plugin rejected its options: ${parsed.error.message}`,
			);
		}
		const opts = parsed.data;
		const pluginCacheDir = isAbsolute(ctx.pluginCacheDir)
			? ctx.pluginCacheDir
			: ctx.workspace.resolve(ctx.pluginCacheDir);
		const cacheDir = isAbsolute(ctx.cacheDir)
			? ctx.cacheDir
			: ctx.workspace.resolve(ctx.cacheDir);
		const defaults: ISearchOptions = {
			...(opts.roots !== undefined ? { roots: opts.roots } : {}),
			...(opts.extensions !== undefined
				? { extensions: opts.extensions }
				: {}),
			...(opts.ignoreDirs !== undefined
				? { ignoreDirs: opts.ignoreDirs }
				: {}),
			...(opts.maxResults !== undefined
				? { maxResults: opts.maxResults }
				: {}),
		};
		const hybridWeights = {
			...(opts.hybridWeights?.bm25 !== undefined
				? { bm25: opts.hybridWeights.bm25 }
				: {}),
			...(opts.hybridWeights?.vector !== undefined
				? { vector: opts.hybridWeights.vector }
				: {}),
		};
		return {
			tools: buildSearchToolRegistrations({
				namespacePrefix: ctx.namespacePrefix,
				workspaceRootAbs: ctx.workspace.root,
				defaults,
				cacheDir,
				pluginCacheDir,
				...(Object.keys(hybridWeights).length > 0
					? { hybridWeights }
					: {}),
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

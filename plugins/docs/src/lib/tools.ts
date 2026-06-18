import { z } from 'zod';

import type { IToolRegistration } from '@mcp-vertex/core/public';
import { toolJson } from '@mcp-vertex/core/public';

import { listDocs, readDoc } from './engine';
import type { IDocsOptions } from './engine';

export interface IDocsToolOptions {
	readonly namespacePrefix: string;
	readonly workspaceRootAbs: string;
	readonly defaults?: IDocsOptions;
}

/**
 * Project documentation tools: `docs_list` catalogues markdown under the
 * configured roots (low-token: path + title), `docs_read` returns one doc
 * by path. Complements `search` (grep) with curated navigation.
 */
export const buildDocsToolRegistrations = (
	options: IDocsToolOptions,
): readonly IToolRegistration[] => {
	const prefix = options.namespacePrefix;
	const defaults = options.defaults ?? {};
	return [
		{
			id: 'docs_list',
			summary:
				'Catalogue the project markdown docs (path + title), low-token.',
			tags: ['docs', 'orientation', 'lazy'],
			register: async (server) => {
				server.registerTool(
					`${prefix}_docs_list`,
					{
						description:
							'List the project documentation: markdown under the configured roots as {path, title}. Low-token index — read one with docs_read. Paginated: `limit` (default 50, max 200) + `offset`; returns {docs,count,total,offset,nextOffset?,truncated}. Read-only.',
						inputSchema: z.object({
							roots: z.array(z.string()).optional(),
							limit: z.number().optional(),
							offset: z.number().optional(),
						}),
						outputSchema: z.object({
							count: z.number(),
							total: z.number(),
							offset: z.number(),
							nextOffset: z.number().optional(),
							truncated: z.boolean(),
							docs: z.array(
								z.object({
									path: z.string(),
									title: z.string(),
								}),
							),
						}),
					},
					async (args: {
						roots?: string[] | undefined;
						limit?: number | undefined;
						offset?: number | undefined;
					}) => {
						const { docs, truncated } = await listDocs(
							options.workspaceRootAbs,
							{
								...defaults,
								...(args.roots ? { roots: args.roots } : {}),
							},
						);
						const limit = Math.max(
							1,
							Math.min(200, Math.floor(args.limit ?? 50)),
						);
						const offset = Math.max(
							0,
							Math.floor(args.offset ?? 0),
						);
						const page = docs.slice(offset, offset + limit);
						const nextOffset = offset + page.length;
						return toolJson({
							count: page.length,
							total: docs.length,
							offset,
							...(nextOffset < docs.length ? { nextOffset } : {}),
							truncated,
							docs: page,
						});
					},
				);
			},
		},
		{
			id: 'docs_read',
			summary: 'Read one project doc by its workspace-relative path.',
			tags: ['docs', 'lazy'],
			register: async (server) => {
				server.registerTool(
					`${prefix}_docs_read`,
					{
						description:
							'Read one documentation file by its workspace-relative path (from docs_list). Returns {path,title,content,truncated,found}. Refuses paths outside the workspace. Read-only.',
						inputSchema: z.object({ path: z.string() }),
						outputSchema: z.object({
							path: z.string(),
							title: z.string(),
							content: z.string(),
							truncated: z.boolean(),
							found: z.boolean(),
						}),
					},
					async (args: { path: string }) =>
						toolJson(
							await readDoc(options.workspaceRootAbs, args.path),
						),
				);
			},
		},
	];
};

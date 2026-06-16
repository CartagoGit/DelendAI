import { z } from 'zod';

import type { IToolRegistration } from '@cartago-git/mcp-core/public';
import { toolJson } from '@cartago-git/mcp-core/public';

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
	options: IDocsToolOptions
): readonly IToolRegistration[] => {
	const prefix = options.namespacePrefix;
	const defaults = options.defaults ?? {};
	return [
		{
			id: 'docs_list',
			summary: 'Catalogue the project markdown docs (path + title), low-token.',
			tags: ['docs', 'orientation', 'lazy'],
			register: async (server) => {
				server.registerTool(
					`${prefix}_docs_list`,
					{
						description:
							'List the project documentation: every markdown file under the configured roots as {path, title}. Low-token index — read one with docs_read. Read-only.',
						inputSchema: z.object({
							roots: z.array(z.string()).optional(),
						}),
						outputSchema: z.object({
							count: z.number(),
							truncated: z.boolean(),
							docs: z.array(
								z.object({ path: z.string(), title: z.string() })
							),
						}),
					},
					async (args: { roots?: string[] | undefined }) => {
						const { docs, truncated } = listDocs(
							options.workspaceRootAbs,
							{
								...defaults,
								...(args.roots ? { roots: args.roots } : {}),
							}
						);
						return toolJson({ count: docs.length, truncated, docs });
					}
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
						toolJson(readDoc(options.workspaceRootAbs, args.path))
				);
			},
		},
	];
};

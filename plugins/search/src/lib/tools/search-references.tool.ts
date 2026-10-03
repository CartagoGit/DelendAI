import z from 'zod';

import {
	SafeWorkspaceReader,
	WorkspaceContainmentError,
	toolError,
	toolJson,
	type IToolRegistration,
} from '@delendai/core/public';

import { listContainedTypeScriptFiles } from '../services/search-safe-reader';
import type { ISearchToolOptions } from './search.tool';
import { findSymbolReferences } from './find-symbol';

const argsSchema = z.object({
	symbol: z.string().min(1),
	cwd: z.string().optional(),
});

const outputSchema = z.object({
	hits: z.array(
		z.object({
			file: z.string(),
			line: z.number(),
			column: z.number(),
			isDefinition: z.boolean(),
		}),
	),
});

export const buildSearchReferencesToolRegistration = (
	options: ISearchToolOptions,
): IToolRegistration => ({
	id: 'references',
	summary: 'Find identifier occurrences of a symbol in ts/tsx files.',
	tags: ['search', 'lazy'],
	register: async (server) => {
		server.registerTool(
			`${options.namespacePrefix}_references`,
			{
				description:
					'Find identifier occurrences of `symbol` in ts/tsx files, skipping comments and strings. Read-only.',
				inputSchema: argsSchema,
				outputSchema,
			},
			async (rawArgs: unknown) => {
				const parsed = argsSchema.safeParse(rawArgs);
				if (!parsed.success) {
					return toolError(
						parsed.error.issues
							.map((issue) => issue.message)
							.join('; '),
						'Fix the tool input and retry.',
					);
				}
				const reader = new SafeWorkspaceReader(
					options.workspaceRootAbs,
				);
				let files: readonly string[];
				try {
					files = await listContainedTypeScriptFiles(
						reader,
						parsed.data.cwd ?? '.',
					);
				} catch (error) {
					if (error instanceof WorkspaceContainmentError) {
						return toolError(
							'cwd must stay inside the workspace',
							'Pass a relative path inside the workspace.',
						);
					}
					throw error;
				}
				const hits = (
					await Promise.all(
						files.map(async (relativePath) => {
							const source = await reader.readText(relativePath);
							return findSymbolReferences(
								source.path.relativePath,
								source.content,
								parsed.data.symbol,
							);
						}),
					)
				).flat();
				return toolJson({ hits });
			},
		);
	},
});

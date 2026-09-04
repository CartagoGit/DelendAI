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
import { findSymbolDeclarations } from './find-symbol';

const argsSchema = z.object({
	symbol: z.string().min(1),
	cwd: z.string().optional(),
});

const symbolHitSchema = z.object({
	file: z.string(),
	line: z.number(),
	column: z.number(),
	kind: z.enum([
		'function',
		'class',
		'interface',
		'type',
		'enum',
		'variable',
		'export-from',
	]),
	exportPath: z.string().optional(),
});

export const buildSearchSymbolToolRegistration = (
	options: ISearchToolOptions,
): IToolRegistration => ({
	id: 'symbol',
	summary: 'Find exported declarations whose name exactly matches a symbol.',
	tags: ['search', 'lazy'],
	register: async (server) => {
		server.registerTool(
			`${options.namespacePrefix}_symbol`,
			{
				description:
					'Find exported declarations whose name exactly matches `symbol` across ts/tsx files in the workspace. Read-only.',
				inputSchema: argsSchema,
				outputSchema: z.object({ hits: z.array(symbolHitSchema) }),
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
							return findSymbolDeclarations(
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

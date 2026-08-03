import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';

import z from 'zod';

import {
	resolveWorkspaceContained,
	toolError,
	toolJson,
	type IToolRegistration,
} from '@mcp-vertex/core/public';

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

const walkTsFiles = async (
	rootAbs: string,
	relative = '',
): Promise<string[]> => {
	const dirAbs = join(rootAbs, relative);
	const entries = await readdir(dirAbs, { withFileTypes: true }).catch(
		() => [],
	);
	const files: string[] = [];
	for (const entry of entries) {
		if (entry.isDirectory()) {
			if (['node_modules', '.git', 'dist', 'build'].includes(entry.name))
				continue;
			files.push(
				...(await walkTsFiles(rootAbs, join(relative, entry.name))),
			);
			continue;
		}
		if (
			entry.isFile() &&
			(entry.name.endsWith('.ts') || entry.name.endsWith('.tsx'))
		) {
			files.push(join(relative, entry.name));
		}
	}
	return files;
};

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
				const contained = resolveWorkspaceContained(
					options.workspaceRootAbs,
					parsed.data.cwd ?? '.',
				);
				if (!contained.ok) {
					return toolError(
						'cwd must stay inside the workspace',
						'Pass a relative path inside the workspace.',
					);
				}
				const files = await walkTsFiles(contained.abs);
				const hits = (
					await Promise.all(
						files.map(async (relativePath) => {
							const absPath = join(contained.abs, relativePath);
							const workspacePath =
								`${contained.rel === '.' ? '' : `${contained.rel}/`}${relativePath}`
									.split('\\')
									.join('/');
							const source = await readFile(absPath, 'utf8');
							return findSymbolReferences(
								workspacePath,
								source,
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

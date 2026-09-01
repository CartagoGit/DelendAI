import { readdir } from 'node:fs/promises';
import { join } from 'node:path';

import z from 'zod';

import {
	SafeWorkspaceReader,
	resolveWorkspaceContained,
	toolError,
	toolJson,
	type IToolRegistration,
} from '@mcp-vertex/core/public';

import type { IDocsToolOptions } from './tools';
import {
	generateModuleMarkdown,
	generateReadmeMarkdown,
	type IGeneratedDocFile,
} from './generate-docs';

const argsSchema = z.object({
	cwd: z.string().optional(),
	scope: z.enum(['readme', 'module', 'all']).optional(),
});

const outputSchema = z.object({
	ok: z.literal(true),
	files: z.array(
		z.object({
			path: z.string(),
			markdown: z.string(),
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
		if (entry.isFile() && entry.name.endsWith('.ts'))
			files.push(join(relative, entry.name));
	}
	return files;
};

export const buildDocsGenerateToolRegistration = (
	options: IDocsToolOptions,
): IToolRegistration => ({
	id: 'docs_generate',
	summary: 'Generate markdown summaries for src/**/*.ts modules.',
	tags: ['docs', 'lazy'],
	register: async (server) => {
		server.registerTool(
			`${options.namespacePrefix}_docs_generate`,
			{
				description:
					'Generate markdown summaries for TypeScript source files under src/. Can return per-module docs, a synthetic README, or both.',
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
				const scope = parsed.data.scope ?? 'all';
				const srcRel =
					contained.rel === '.' ? 'src' : `${contained.rel}/src`;
				const srcAbs = join(options.workspaceRootAbs, srcRel);
				const reader = new SafeWorkspaceReader(
					options.workspaceRootAbs,
				);
				const moduleFiles = await walkTsFiles(srcAbs);
				const generated: IGeneratedDocFile[] = await Promise.all(
					moduleFiles.map(async (relativePath) => {
						const workspacePath = `${srcRel}/${relativePath}`
							.split('\\')
							.join('/');
						const source = (await reader.readText(workspacePath))
							.content;
						return {
							path: workspacePath,
							markdown: generateModuleMarkdown(
								workspacePath,
								source,
							),
						};
					}),
				);
				const files =
					scope === 'module'
						? generated
						: scope === 'readme'
							? [
									{
										path: 'README.generated.md',
										markdown:
											generateReadmeMarkdown(generated),
									},
								]
							: [
									{
										path: 'README.generated.md',
										markdown:
											generateReadmeMarkdown(generated),
									},
									...generated,
								];
				return toolJson({ ok: true as const, files });
			},
		);
	},
});

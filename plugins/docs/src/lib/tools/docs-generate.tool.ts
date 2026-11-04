import { join } from 'node:path';

import z from 'zod';

import {
	resolveExistingWorkspaceContained,
	safeListDir,
	toolError,
	toolJson,
} from '@delendai/core/public';
import { SafeWorkspaceReader } from '@delendai/core/runtime';
import type { IToolRegistration } from '@delendai/core/contracts';

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
	unreadable: z.array(z.object({ path: z.string(), reason: z.string() })),
});

interface IUnreadable {
	readonly path: string;
	readonly reason: string;
}

const walkTsFiles = async (
	rootAbs: string,
	unreadable: IUnreadable[],
	relative = '',
): Promise<string[]> => {
	const dirAbs = join(rootAbs, relative);
	const listing = await safeListDir(dirAbs);
	if (listing.reason !== undefined && listing.reason !== 'directory-empty') {
		unreadable.push({ path: relative || '.', reason: listing.reason });
	}
	const entries = listing.entries;
	const files: string[] = [];
	for (const entry of entries) {
		if (entry.isDirectory()) {
			if (['node_modules', '.git', 'dist', 'build'].includes(entry.name))
				continue;
			files.push(
				...(await walkTsFiles(
					rootAbs,
					unreadable,
					join(relative, entry.name),
				)),
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
				const contained = await resolveExistingWorkspaceContained(
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
				const unreadable: IUnreadable[] = [];
				const moduleFiles = await walkTsFiles(srcAbs, unreadable);
				const read = await Promise.all(
					moduleFiles.map(
						async (
							relativePath,
						): Promise<IGeneratedDocFile | null> => {
							const workspacePath = `${srcRel}/${relativePath}`
								.split('\\')
								.join('/');
							try {
								const source = (
									await reader.readText(workspacePath)
								).content;
								return {
									path: workspacePath,
									markdown: generateModuleMarkdown(
										workspacePath,
										source,
									),
								};
							} catch (error: unknown) {
								unreadable.push({
									path: workspacePath,
									reason: `read-failed: ${error instanceof Error ? error.message : String(error)}`,
								});
								return null;
							}
						},
					),
				);
				const generated: IGeneratedDocFile[] = read.filter(
					(file): file is IGeneratedDocFile => file !== null,
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
				return toolJson({ ok: true as const, files, unreadable });
			},
		);
	},
});

import { join } from 'node:path';

import z from 'zod';

import {
	SafeWorkspaceReader,
	resolveWorkspaceContained,
	safeListDir,
	toolError,
	toolJson,
	type IToolRegistration,
} from '@delendai/core/public';

import type { IQualityToolOptions } from './tools';
import { scanComplexityProject } from './complexity';

const argsSchema = z.object({
	cwd: z.string().optional(),
	threshold: z.number().int().positive().optional(),
});

const findingSchema = z.object({
	file: z.string(),
	line: z.number(),
	function: z.string(),
	complexity: z.number(),
	threshold: z.number(),
});

const outputSchema = z.object({
	ok: z.literal(true),
	findings: z.array(findingSchema),
});

const walkTsFiles = async (
	rootAbs: string,
	relative = '',
): Promise<string[]> => {
	const dirAbs = join(rootAbs, relative);
	const entries = (await safeListDir(dirAbs)).entries;
	const files: string[] = [];
	for (const entry of entries) {
		if (entry.isDirectory()) {
			if (['node_modules', 'dist', 'build', '.git'].includes(entry.name))
				continue;
			files.push(
				...(await walkTsFiles(rootAbs, join(relative, entry.name))),
			);
			continue;
		}
		if (!entry.isFile()) continue;
		if (entry.name.endsWith('.ts') || entry.name.endsWith('.tsx')) {
			files.push(join(relative, entry.name));
		}
	}
	return files;
};

export const buildQualityComplexityToolRegistration = (
	options: IQualityToolOptions,
): IToolRegistration => ({
	id: 'complexity',
	summary: 'Approximate cyclomatic hotspots in src/**/*.ts(x).',
	tags: ['quality', 'complexity'],
	register: async (server) => {
		server.registerTool(
			`${options.namespacePrefix}_complexity`,
			{
				description:
					'Scan src/**/*.ts and src/**/*.tsx under the requested cwd and return functions whose approximate cyclomatic complexity exceeds the threshold.',
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
				const threshold = parsed.data.threshold ?? 10;
				const contained = resolveWorkspaceContained(
					options.workspaceRoot,
					parsed.data.cwd ?? '.',
				);
				if (!contained.ok) {
					return toolError(
						'cwd must stay inside the workspace',
						'Pass a relative path inside the workspace.',
					);
				}
				const srcRel =
					contained.rel === '.' ? 'src' : `${contained.rel}/src`;
				const srcAbs = join(options.workspaceRoot, srcRel);
				const reader = new SafeWorkspaceReader(options.workspaceRoot);
				const files = await walkTsFiles(srcAbs);
				const contents = await Promise.all(
					files.map(async (relativePath) => ({
						path: `${srcRel}/${relativePath}`.split('\\').join('/'),
						source: (
							await reader.readText(
								`${srcRel}/${relativePath}`
									.split('\\')
									.join('/'),
							)
						).content,
					})),
				);
				const result = scanComplexityProject(contents, threshold);
				return toolJson({
					ok: true as const,
					findings: result.findings,
				});
			},
		);
	},
});

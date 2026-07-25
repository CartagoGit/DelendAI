import { readdir, readFile, rename, unlink, writeFile } from 'node:fs/promises';
import {
	basename,
	dirname,
	isAbsolute,
	join,
	relative,
	resolve,
	sep,
} from 'node:path';

import { z } from 'zod';

import type { IToolRegistration } from '@mcp-vertex/core/public';
import { toolError, toolJson } from '@mcp-vertex/core/public';

import { runCodemodRecipeOnSource } from '../codemod/codemod-runner';
import { getCodemodRecipe } from '../codemod/recipes';

export interface IRefactorCodemodToolOptions {
	readonly namespacePrefix: string;
	readonly workspaceRootAbs: string;
	readonly readFile?: (absPath: string) => Promise<string>;
	readonly listFiles?: (cwdAbs: string) => Promise<readonly string[]>;
	readonly writeFileAtomic?: (
		absPath: string,
		content: string,
	) => Promise<void>;
}

const codemodFileSchema = z.object({
	path: z.string(),
	diff: z.string(),
});

export const RefactorCodemodInputSchema = z.object({
	recipeId: z.string().min(1),
	cwd: z.string().min(1).optional(),
	dryRun: z.boolean().optional(),
});

export const RefactorCodemodOutputSchema = z.object({
	recipeId: z.string(),
	files: z.array(codemodFileSchema),
	totalEdits: z.number().int().nonnegative(),
	language: z.string(),
});

const SKIP_DIRS = new Set([
	'.git',
	'.hg',
	'.svn',
	'node_modules',
	'dist',
	'build',
	'coverage',
]);

const toPosixPath = (path: string): string => path.split(sep).join('/');

const requireContainment = (root: string, path: string): string => {
	const abs = isAbsolute(path) ? resolve(path) : resolve(root, path);
	const rel = relative(root, abs);
	if (rel.startsWith('..') || isAbsolute(rel)) {
		throw new Error(`path "${path}" escapes workspace root`);
	}
	return abs;
};

const globToRegExp = (glob: string): RegExp => {
	let pattern = '^';
	for (let i = 0; i < glob.length; i++) {
		const char = glob[i];
		if (char === undefined) break;
		const next = glob[i + 1];
		if (char === '*') {
			if (next === '*') {
				const after = glob[i + 2];
				if (after === '/') {
					pattern += '(?:.*/)?';
					i += 2;
					continue;
				}
				pattern += '.*';
				i++;
				continue;
			}
			pattern += '[^/]*';
			continue;
		}
		if (char === '?') {
			pattern += '[^/]';
			continue;
		}
		pattern += /[|\\{}()[\]^$+?.]/.test(char) ? `\\${char}` : char;
	}
	pattern += '$';
	return new RegExp(pattern);
};

const matchesRecipeGlobs = (
	path: string,
	globs: readonly string[] | undefined,
): boolean => {
	if (globs === undefined || globs.length === 0) return true;
	return globs.some((glob) => globToRegExp(glob).test(path));
};

const walkContainedFiles = async (
	cwdAbs: string,
): Promise<readonly string[]> => {
	const files: string[] = [];
	const visit = async (dirAbs: string): Promise<void> => {
		const entries = await readdir(dirAbs, { withFileTypes: true });
		for (const entry of entries) {
			const next = join(dirAbs, entry.name);
			if (entry.isDirectory()) {
				if (SKIP_DIRS.has(entry.name)) continue;
				await visit(next);
				continue;
			}
			if (entry.isFile()) files.push(next);
		}
	};
	await visit(cwdAbs);
	return files;
};

const defaultWriteFileAtomic = async (
	absPath: string,
	content: string,
): Promise<void> => {
	const tmpPath = join(
		dirname(absPath),
		`.${basename(absPath)}.tmp-${process.pid}-${Date.now()}`,
	);
	try {
		await writeFile(tmpPath, content, 'utf8');
		await rename(tmpPath, absPath);
	} catch (error) {
		await unlink(tmpPath).catch(() => undefined);
		throw error;
	}
};

export const buildRefactorCodemodToolRegistrations = (
	options: IRefactorCodemodToolOptions,
): readonly IToolRegistration[] => {
	const prefix = options.namespacePrefix;
	const read =
		options.readFile ?? ((absPath: string) => readFile(absPath, 'utf8'));
	const listFiles = options.listFiles ?? walkContainedFiles;
	const writeAtomic = options.writeFileAtomic ?? defaultWriteFileAtomic;

	return [
		{
			id: 'refactor_codemod',
			summary:
				'Run a repo recipe as a boundary-safe codemod and return unified diffs.',
			tags: ['refactor', 'lazy'],
			register: async (server) => {
				server.registerTool(
					`${prefix}_refactor_codemod`,
					{
						description:
							'Run a recipe-library codemod under `cwd` (default: workspace root). Returns unified diffs for every changed file; with `dryRun: false` it writes the contained files atomically.',
						inputSchema: RefactorCodemodInputSchema,
						outputSchema: RefactorCodemodOutputSchema,
					},
					async (args) => {
						const recipe = getCodemodRecipe(args.recipeId);
						if (recipe === undefined) {
							return toolError(
								`unknown recipe "${args.recipeId}"`,
								'code: unknown-recipe',
							);
						}

						let cwdAbs: string;
						try {
							cwdAbs = requireContainment(
								options.workspaceRootAbs,
								args.cwd ?? '.',
							);
						} catch (error) {
							return toolError(
								'cwd escapes workspace root',
								(error as Error).message,
							);
						}

						let filesInScope: readonly string[];
						try {
							filesInScope = await listFiles(cwdAbs);
						} catch (error) {
							return toolError(
								'cannot enumerate files',
								(error as Error).message,
							);
						}

						const changedFiles: Array<{
							path: string;
							diff: string;
						}> = [];
						let totalEdits = 0;

						for (const absPath of filesInScope) {
							let safeAbs: string;
							try {
								safeAbs = requireContainment(
									options.workspaceRootAbs,
									absPath,
								);
							} catch {
								return toolError(
									'file escapes workspace root',
									`path: ${absPath}`,
								);
							}
							const relativeToCwd = toPosixPath(
								relative(cwdAbs, safeAbs),
							);
							if (
								!matchesRecipeGlobs(relativeToCwd, recipe.globs)
							)
								continue;

							let source: string;
							try {
								source = await read(safeAbs);
							} catch (error) {
								return toolError(
									`cannot read "${relativeToCwd}"`,
									(error as Error).message,
								);
							}

							const relativeToRoot = toPosixPath(
								relative(options.workspaceRootAbs, safeAbs),
							);
							const result = runCodemodRecipeOnSource(
								recipe,
								relativeToRoot,
								source,
							);
							if (result === undefined) continue;

							changedFiles.push({
								path: result.path,
								diff: result.diff,
							});
							totalEdits += result.edits;

							if (args.dryRun === false) {
								try {
									await writeAtomic(
										safeAbs,
										result.newContent,
									);
								} catch (error) {
									return toolError(
										`cannot write "${relativeToRoot}"`,
										(error as Error).message,
									);
								}
							}
						}

						return toolJson({
							recipeId: recipe.id,
							files: changedFiles,
							totalEdits,
							language: recipe.language,
						});
					},
				);
			},
		},
	];
};

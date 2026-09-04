import { resolve } from 'node:path';

import z from 'zod';

import type { IToolRegistration } from '@delendai/core/public';
import { toolError, toolJson } from '@delendai/core/public';

import { runCodemod, type ICodemodRunnerDeps } from '../codemod/codemod-runner';
import {
	CODEMOD_RECIPE_IDS,
	getCodemodRecipe,
	type ICodemodRecipe,
} from '../codemod/recipes';

export interface IRefactorCodemodToolOptions extends ICodemodRunnerDeps {
	readonly namespacePrefix: string;
	readonly workspaceRootAbs: string;
}

const fileSchema = z.object({
	path: z.string(),
	diff: z.string(),
});

const OUTPUT_SCHEMA = z.object({
	files: z.array(fileSchema),
	totalEdits: z.number().int().nonnegative(),
	language: z.string(),
});

const recipeIdSchema = z.enum(CODEMOD_RECIPE_IDS);

const resolvePath = (root: string, path: string): string => {
	if (path.startsWith('/')) {
		return resolve(path);
	}
	return resolve(root, path);
};

const isContainedPath = (root: string, target: string): boolean => {
	const normalizedRoot = resolve(root);
	const normalizedTarget = resolve(target);
	return (
		normalizedTarget === normalizedRoot ||
		normalizedTarget.startsWith(`${normalizedRoot}/`)
	);
};

const mustGetRecipe = (
	recipeId: ICodemodRecipe['id'],
): ICodemodRecipe | undefined => {
	return getCodemodRecipe(recipeId);
};

export const buildRefactorCodemodToolRegistrations = (
	options: IRefactorCodemodToolOptions,
): readonly IToolRegistration[] => {
	const prefix = options.namespacePrefix;

	return [
		{
			id: 'refactor_codemod',
			summary: 'Rule-based codemod planner with dry-run unified diffs.',
			tags: ['refactor', 'lazy'],
			register: async (server) => {
				server.registerTool(
					`${prefix}_refactor_codemod`,
					{
						description:
							'Run a built-in codemod recipe against TypeScript-family files under `cwd` and return dry-run unified diffs only. No writes occur, even when `dryRun` is `false`.',
						inputSchema: z.object({
							recipeId: recipeIdSchema,
							cwd: z.string().min(1),
							dryRun: z.boolean().optional(),
						}),
						outputSchema: OUTPUT_SCHEMA,
					},
					async (args) => {
						const recipe = mustGetRecipe(args.recipeId);
						if (recipe === undefined) {
							return toolError(
								'unknown-recipe',
								`Unknown codemod recipe: ${args.recipeId}`,
							);
						}

						const cwd = resolvePath(
							options.workspaceRootAbs,
							args.cwd,
						);
						if (!isContainedPath(options.workspaceRootAbs, cwd)) {
							return toolError(
								'containment-violation',
								`Path "${args.cwd}" is outside workspace root`,
							);
						}

						const result = await runCodemod(
							{
								cwd,
								recipe,
								...(args.dryRun !== undefined
									? { dryRun: args.dryRun }
									: {}),
							},
							{
								...(options.listFiles !== undefined
									? { listFiles: options.listFiles }
									: {}),
								...(options.readFile !== undefined
									? { readFile: options.readFile }
									: {}),
							},
						);

						if (!result.ok) {
							return toolError(result.code, result.detail);
						}

						return toolJson({
							files: result.files.map((file) => ({
								path: file.path,
								diff: file.diff,
							})),
							totalEdits: result.totalEdits,
							language: result.language,
						});
					},
				);
			},
		},
	];
};

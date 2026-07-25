export interface ICodemodRecipe {
	readonly id: string;
	readonly name: string;
	readonly language: 'ts';
	readonly pattern: string;
	readonly replacement: string;
	readonly globs?: readonly string[];
}

const TS_GLOBS = [
	'**/*.ts',
	'**/*.tsx',
	'**/*.mts',
	'**/*.cts',
	'**/*.js',
	'**/*.jsx',
	'**/*.mjs',
	'**/*.cjs',
] as const;

export const CODEMOD_RECIPES: readonly ICodemodRecipe[] = [
	{
		id: 'ts/no-throw-literal',
		name: 'Wrap string literal throws in Error',
		language: 'ts',
		pattern: 'throw $MESSAGE',
		replacement: 'throw new Error($MESSAGE)',
		globs: TS_GLOBS,
	},
	{
		id: 'ts/strict-equal',
		name: 'Replace == with ===',
		language: 'ts',
		pattern: '$LEFT == $RIGHT',
		replacement: '$LEFT === $RIGHT',
		globs: TS_GLOBS,
	},
	{
		id: 'ts/console-to-logger',
		name: 'Replace console.log with logger.info when logger is imported',
		language: 'ts',
		pattern: 'console.log($$$ARGS)',
		replacement: 'logger.info($$$ARGS)',
		globs: TS_GLOBS,
	},
] as const;

export const getCodemodRecipe = (
	recipeId: string,
): ICodemodRecipe | undefined =>
	CODEMOD_RECIPES.find((recipe) => recipe.id === recipeId);

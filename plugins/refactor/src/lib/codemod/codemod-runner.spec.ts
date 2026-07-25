import { describe, expect, it } from 'vitest';

import { runCodemodRecipeOnSource } from './codemod-runner';
import { getCodemodRecipe } from './recipes';

const requireRecipe = (recipeId: string) => {
	const recipe = getCodemodRecipe(recipeId);
	if (recipe === undefined) throw new Error(`missing recipe ${recipeId}`);
	return recipe;
};

describe('codemod-runner recipes (f00123 S3)', () => {
	it('ts/no-throw-literal wraps only the throw expression and leaves adjacent lines untouched', () => {
		const source = [
			'export function fail(input: string) {',
			'\tconst before = input.trim();',
			"\tthrow 'boom';",
			'\tconst after = before.toUpperCase();',
			'}',
		].join('\n');
		const result = runCodemodRecipeOnSource(
			requireRecipe('ts/no-throw-literal'),
			'src/fail.ts',
			source,
		);
		expect(result).toBeDefined();
		expect(result?.newContent).toContain("throw new Error('boom');");
		const lines = result?.newContent.split('\n') ?? [];
		expect(lines[1]).toBe('\tconst before = input.trim();');
		expect(lines[3]).toBe('\tconst after = before.toUpperCase();');
	});

	it('ts/strict-equal rewrites == only and leaves neighboring logic untouched', () => {
		const source = [
			'export const same = left === right;',
			'export const loose = left == right;',
			'export const different = left !== right;',
		].join('\n');
		const result = runCodemodRecipeOnSource(
			requireRecipe('ts/strict-equal'),
			'src/compare.ts',
			source,
		);
		expect(result).toBeDefined();
		const lines = result?.newContent.split('\n') ?? [];
		expect(lines[0]).toBe('export const same = left === right;');
		expect(lines[1]).toBe('export const loose = left === right;');
		expect(lines[2]).toBe('export const different = left !== right;');
	});

	it('ts/console-to-logger rewrites console.log only when logger is imported and leaves nearby calls untouched', () => {
		const source = [
			"import { logger } from './logger';",
			'const before = prepare(value);',
			'console.log(value);',
			'console.error(value);',
		].join('\n');
		const result = runCodemodRecipeOnSource(
			requireRecipe('ts/console-to-logger'),
			'src/log.ts',
			source,
		);
		expect(result).toBeDefined();
		const lines = result?.newContent.split('\n') ?? [];
		expect(lines[1]).toBe('const before = prepare(value);');
		expect(lines[2]).toBe('logger.info(value);');
		expect(lines[3]).toBe('console.error(value);');
	});

	it('ts/console-to-logger leaves files alone when no logger import exists', () => {
		const source = [
			'const before = prepare(value);',
			'console.log(value);',
			'const after = finish(value);',
		].join('\n');
		const result = runCodemodRecipeOnSource(
			requireRecipe('ts/console-to-logger'),
			'src/log.ts',
			source,
		);
		expect(result).toBeUndefined();
	});
});

import { describe, expect, it } from 'vitest';

import {
	applyCodemodEdits,
	getCodemodRecipe,
	type ICodemodRecipe,
} from './recipes';

const applyRecipe = (
	recipeId: ICodemodRecipe['id'],
	source: string,
): string => {
	const recipe = getCodemodRecipe(recipeId);
	if (recipe === undefined) {
		throw new Error(`Unknown recipe: ${recipeId}`);
	}
	const result = recipe.apply('/repo/sample.ts', source);
	return applyCodemodEdits(source, result.edits);
};

describe('codemod recipes (f00123 S3)', () => {
	it('ts/no-throw-literal wraps throw literals and leaves existing Error throws intact', () => {
		const source = `export function fail(kind: string) {
  if (kind === 'literal') {
    throw 'boom';
  }
  throw new Error(kind);
}`;

		const next = applyRecipe('ts/no-throw-literal', source);
		expect(next).toContain(`throw new Error('boom');`);
		expect(next).toContain('throw new Error(kind);');
		expect(next).toContain("if (kind === 'literal') {");
	});

	it('ts/strict-equal upgrades == and != without touching adjacent expressions', () => {
		const source = `const same = value == other;
const different = value != fallback;
const preserved = value >= min;`;

		const next = applyRecipe('ts/strict-equal', source);
		expect(next).toContain('value === other');
		expect(next).toContain('value !== fallback');
		expect(next).toContain('value >= min');
	});

	it('ts/console-to-logger rewrites supported console calls and leaves object methods untouched', () => {
		const source = `console.log('hello');
console.error(problem);
metrics.console.log('skip');`;

		const next = applyRecipe('ts/console-to-logger', source);
		expect(next).toContain("logger.log('hello');");
		expect(next).toContain('logger.error(problem);');
		expect(next).toContain("metrics.console.log('skip');");
	});
});

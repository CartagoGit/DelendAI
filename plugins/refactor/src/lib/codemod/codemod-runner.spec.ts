import { describe, expect, it, vi } from 'vitest';

import { runCodemod } from './codemod-runner';
import { getCodemodRecipe } from './recipes';

describe('codemod-runner (f00123 S3)', () => {
	it('returns unified diffs for changed files', async () => {
		const recipe = getCodemodRecipe('ts/strict-equal');
		expect(recipe).toBeDefined();
		const result = await runCodemod(
			{
				cwd: '/repo',
				recipe: recipe!,
			},
			{
				listFiles: async () => ['/repo/a.ts'],
				readFile: async () =>
					'if (left == right) {\n  return left != right;\n}',
			},
		);

		expect(result.ok).toBe(true);
		if (!result.ok) return;
		expect(result.totalEdits).toBe(2);
		expect(result.files).toHaveLength(1);
		expect(result.files[0]?.path).toBe('a.ts');
		expect(result.files[0]?.diff).toContain('--- a/a.ts');
		expect(result.files[0]?.diff).toContain('+++ b/a.ts');
		expect(result.files[0]?.diff).toContain('+if (left === right) {');
	});

	it('scopes to supported files and skips untouched files', async () => {
		const recipe = getCodemodRecipe('ts/console-to-logger');
		expect(recipe).toBeDefined();
		const reads = new Map<string, string>([
			['/repo/a.ts', "console.log('a');"],
			['/repo/b.md', "console.log('ignore');"],
			['/repo/c.ts', 'const stable = true;'],
		]);

		const result = await runCodemod(
			{
				cwd: '/repo',
				recipe: recipe!,
			},
			{
				listFiles: async () => [
					'/repo/a.ts',
					'/repo/b.md',
					'/repo/c.ts',
				],
				readFile: async (path: string) => reads.get(path) ?? '',
			},
		);

		expect(result.ok).toBe(true);
		if (!result.ok) return;
		expect(result.files).toHaveLength(1);
		expect(result.files[0]?.path).toBe('a.ts');
		expect(result.totalEdits).toBe(1);
	});

	it('remains dry-run only even when dryRun is false', async () => {
		const recipe = getCodemodRecipe('ts/no-throw-literal');
		expect(recipe).toBeDefined();
		const reader = vi.fn(async () => "throw 'boom';");

		const result = await runCodemod(
			{
				cwd: '/repo',
				recipe: recipe!,
				dryRun: false,
			},
			{
				listFiles: async () => ['/repo/a.ts'],
				readFile: reader,
			},
		);

		expect(result.ok).toBe(true);
		if (!result.ok) return;
		expect(result.files[0]?.after).toContain("throw new Error('boom');");
		expect(reader).toHaveBeenCalledTimes(1);
	});
});

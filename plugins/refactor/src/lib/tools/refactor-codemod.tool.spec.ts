import { describe, expect, it } from 'vitest';

import { captureToolRegistration } from '../../../../../tools/scripts/lib/test-mcp-server';

import { buildRefactorCodemodToolRegistrations } from './refactor-codemod.tool';

describe('refactor-codemod tool (f00123 S3)', () => {
	it('returns unified diffs for the selected recipe', async () => {
		const [tool] = buildRefactorCodemodToolRegistrations({
			namespacePrefix: 'test',
			workspaceRootAbs: '/workspace',
			listFiles: async () => ['/workspace/src/demo.ts'],
			readFile: async () => "throw 'boom';",
		});

		const captured = await captureToolRegistration(tool!);
		const payload = (await captured.invoke({
			recipeId: 'ts/no-throw-literal',
			cwd: 'src',
			dryRun: true,
		})) as {
			files: Array<{ path: string; diff: string }>;
			totalEdits: number;
			language: string;
		};

		expect(payload.language).toBe('typescript');
		expect(payload.totalEdits).toBe(1);
		expect(payload.files).toHaveLength(1);
		expect(payload.files[0]?.path).toBe('demo.ts');
		expect(payload.files[0]?.diff).toContain("+throw new Error('boom');");
	});

	it('keeps preview mode semantics when dryRun is false', async () => {
		const [tool] = buildRefactorCodemodToolRegistrations({
			namespacePrefix: 'test',
			workspaceRootAbs: '/workspace',
			listFiles: async () => ['/workspace/src/demo.ts'],
			readFile: async () => 'if (left == right) return left != right;',
		});

		const captured = await captureToolRegistration(tool!);
		const payload = (await captured.invoke({
			recipeId: 'ts/strict-equal',
			cwd: 'src',
			dryRun: false,
		})) as {
			files: Array<{ path: string; diff: string }>;
			totalEdits: number;
		};

		expect(payload.totalEdits).toBe(2);
		expect(payload.files[0]?.diff).toContain('===');
		expect(payload.files[0]?.diff).toContain('!==');
	});

	it('rejects cwd values outside the workspace root', async () => {
		const [tool] = buildRefactorCodemodToolRegistrations({
			namespacePrefix: 'test',
			workspaceRootAbs: '/workspace',
		});

		const captured = await captureToolRegistration(tool!);
		const result = await captured.invokeRaw({
			recipeId: 'ts/console-to-logger',
			cwd: '../outside',
		});

		expect(result.isError).toBe(true);
		expect(result.payload).toMatchObject({
			error: expect.objectContaining({ reason: 'containment-violation' }),
		});
	});
});

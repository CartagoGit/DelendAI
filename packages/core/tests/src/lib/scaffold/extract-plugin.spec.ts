import { mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { extractPlugin } from '../../../../src/lib/scaffold/extract-plugin';

const require = createRequire(import.meta.url);

const loadTsCompilerApi = (): Record<string, any> => {
	const resolvedPackageJson = require.resolve('typescript/package.json');
	const bunStoreDir = resolve(dirname(resolvedPackageJson), '..', '..', '..');
	const candidates: string[] = [];
	for (const entry of readdirSync(bunStoreDir, {
		withFileTypes: true,
	}) as Array<{ isDirectory(): boolean; name: string }>) {
		if (!entry.isDirectory() || !entry.name.startsWith('typescript@')) {
			continue;
		}
		candidates.push(
			resolve(
				bunStoreDir,
				entry.name,
				'node_modules/typescript/lib/typescript.js',
			),
		);
	}
	for (const candidate of candidates.sort().reverse()) {
		try {
			const mod = require(candidate);
			const api = mod.default ?? mod;
			if (
				typeof api.createSourceFile === 'function' &&
				typeof api.forEachChild === 'function' &&
				typeof api.SyntaxKind === 'object'
			) {
				return api as Record<string, any>;
			}
		} catch {}
	}
	throw new Error('No usable TypeScript Compiler API runtime was found.');
};

const tsCompiler = loadTsCompilerApi();

const tempDirs: string[] = [];

afterEach(() => {
	for (const dirPath of tempDirs.splice(0)) {
		rmSync(dirPath, { recursive: true, force: true });
	}
});

const createReadFile = (
	files: Record<string, string>,
): ((path: string) => string | undefined) => {
	return (path) => files[path];
};

describe('extractPlugin (f00120 S3)', () => {
	it('emits a TODO-marked tool stub for a typed sync function', () => {
		const result = extractPlugin({
			sourceGlobs: ['fixtures/parse-log.ts'],
			targetPluginId: 'demo-extract',
			pluginName: 'Demo Extract',
			description: 'Extracted test plugin.',
			readFile: createReadFile({
				'fixtures/parse-log.ts': `export function parseLog(input: string): { entries: string[] } {
	return { entries: input.split('\\n').filter(Boolean) };
}
`,
			}),
		});

		expect(result.skippedExports).toEqual([]);
		expect(result.tools).toHaveLength(1);
		expect(result.tools[0]).toMatchObject({
			name: 'parse_log',
			exportName: 'parseLog',
			inputZod: 'z.object({ input: z.string() })',
			outputZod: 'z.object({ entries: z.array(z.string()) })',
			isMarkedTodo: true,
		});
		expect(result.tools[0]?.stubBody.startsWith('// TODO:')).toBe(true);
		const toolFile = result.files.find(
			(file) =>
				file.path ===
				'plugins/demo-extract/src/lib/tools/parse_log.tool.ts',
		);
		expect(toolFile?.content).toContain(
			'const input = INPUT_SCHEMA.parse(rawArgs);',
		);
	});

	it('emits an awaited stub for Promise-returning functions', () => {
		const result = extractPlugin({
			sourceGlobs: ['fixtures/fetch-users.ts'],
			targetPluginId: 'demo-extract',
			pluginName: 'Demo Extract',
			description: 'Extracted test plugin.',
			readFile: createReadFile({
				'fixtures/fetch-users.ts': `type User = { id: string };
export async function fetchUsers(): Promise<User[]> {
	return [{ id: 'u1' }];
}
`,
			}),
		});

		expect(result.tools).toHaveLength(1);
		expect(result.tools[0]?.stubBody).toContain('await fetchUsers()');
		expect(result.tools[0]?.outputZod).toBe(
			'z.object({ result: z.array(z.unknown()) })',
		);
	});

	it('treats console-only bodies as pure enough to extract', () => {
		const result = extractPlugin({
			sourceGlobs: ['fixtures/console-only.ts'],
			targetPluginId: 'demo-extract',
			pluginName: 'Demo Extract',
			description: 'Extracted test plugin.',
			readFile: createReadFile({
				'fixtures/console-only.ts': `export function countEntries(input: string[]): number {
	console.log(input.length);
	return input.length;
}
`,
			}),
		});

		expect(result.skippedExports).toEqual([]);
		expect(result.tools.map((tool) => tool.exportName)).toEqual([
			'countEntries',
		]);
	});

	it('skips exports that call fs APIs', () => {
		const fixtureDir = mkdtempSync(join(tmpdir(), 'extract-plugin-'));
		tempDirs.push(fixtureDir);
		writeFileSync(
			join(fixtureDir, 'fs-reader.ts'),
			`import * as fs from 'node:fs';
export function loadLog(path: string): string {
	return fs.readFileSync(path, 'utf8');
}
`,
		);
		const result = extractPlugin({
			sourceGlobs: [fixtureDir],
			targetPluginId: 'demo-extract',
			pluginName: 'Demo Extract',
			description: 'Extracted test plugin.',
		});

		expect(result.tools).toHaveLength(0);
		expect(result.skippedExports).toEqual([
			{ name: 'loadLog', reason: 'has-side-effects' },
		]);
	});

	it('produces a complete scaffold with a parseable plugin index', () => {
		const result = extractPlugin({
			sourceGlobs: ['fixtures/parse-log.ts', 'fixtures/console-only.ts'],
			targetPluginId: 'demo-extract',
			pluginName: 'Demo Extract',
			description: 'Extracted test plugin.',
			readFile: createReadFile({
				'fixtures/parse-log.ts': `export function parseLog(input: string): { entries: string[] } {
	return { entries: input.split('\\n').filter(Boolean) };
}
`,
				'fixtures/console-only.ts': `export function countEntries(input: string[]): number {
	console.log(input.length);
	return input.length;
}
`,
			}),
		});

		const paths = result.files.map((file) => file.path);
		expect(paths).toContain('plugins/demo-extract/package.json');
		expect(paths).toContain('plugins/demo-extract/README.md');
		expect(paths).toContain('plugins/demo-extract/LICENSE');
		expect(paths).toContain('plugins/demo-extract/src/public/index.ts');
		expect(paths).toContain(
			'plugins/demo-extract/tests/src/lib/parse_log.spec.ts',
		);
		const indexFile = result.files.find(
			(file) => file.path === 'plugins/demo-extract/src/index.ts',
		);
		expect(indexFile?.content).toContain('definePlugin');
		const sourceFile = tsCompiler.createSourceFile(
			'plugins/demo-extract/src/index.ts',
			indexFile?.content ?? '',
			tsCompiler.ScriptTarget.Latest,
			true,
			tsCompiler.ScriptKind.TS,
		);
		expect(sourceFile.parseDiagnostics).toHaveLength(0);
	});

	it('preserves scaffold paths for repeated separators in the target plugin id', () => {
		const result = extractPlugin({
			sourceGlobs: ['fixtures/parse-log.ts'],
			targetPluginId: '  Demo___Extract!!!  ',
			pluginName: 'Demo Extract',
			description: 'Extracted test plugin.',
			readFile: createReadFile({
				'fixtures/parse-log.ts': `export function parseLog(input: string): { entries: string[] } {
	return { entries: input.split('\\n').filter(Boolean) };
}
`,
			}),
		});

		expect(result.files.map((file) => file.path)).toContain(
			'plugins/demo-extract/package.json',
		);
	});

	it('normalises a long separator run in the target plugin id quickly', () => {
		const started = Date.now();
		const result = extractPlugin({
			sourceGlobs: ['fixtures/parse-log.ts'],
			targetPluginId: `Demo${'!'.repeat(40_000)}Extract`,
			pluginName: 'Demo Extract',
			description: 'Extracted test plugin.',
			readFile: createReadFile({
				'fixtures/parse-log.ts': `export function parseLog(input: string): { entries: string[] } {
	return { entries: input.split('\\n').filter(Boolean) };
}
`,
			}),
		});

		expect(result.files.map((file) => file.path)).toContain(
			'plugins/demo-extract/package.json',
		);
		expect(Date.now() - started).toBeLessThan(1_000);
	});
});

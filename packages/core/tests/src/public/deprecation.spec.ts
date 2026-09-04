import { createRequire } from 'node:module';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';

import { nodeDynamicImport as deprecatedPublicNodeDynamicImport } from '@delendai/core';
import { nodeDynamicImport as nodeSubpathDynamicImport } from '@delendai/core/node';
import { describe, expect, it } from 'vitest';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = resolve(
	fileURLToPath(new URL('.', import.meta.url)),
	'../../../../..',
);
const PUBLIC_BARREL = resolve(REPO_ROOT, 'packages/core/src/public/index.ts');
const NODE_BARREL = resolve(REPO_ROOT, 'packages/core/src/node/index.ts');
const NODE_SHIM = resolve(
	REPO_ROOT,
	'packages/core/src/node/dynamic-import.ts',
);
const typescript = createRequire(
	resolve(REPO_ROOT, 'tools/docs-api/package.json'),
)('typescript') as {
	ModuleKind: { ESNext: number };
	ModuleResolutionKind: { Bundler: number };
	ScriptTarget: { ES2022: number };
	ScriptSnapshot: { fromString(value: string): unknown };
	createCompilerHost(options: Record<string, unknown>): Record<string, any>;
	createLanguageService(host: Record<string, any>): {
		getSuggestionDiagnostics(fileName: string): Array<{
			code: number;
			messageText: unknown;
		}>;
	};
	flattenDiagnosticMessageText(message: unknown, newline: string): string;
};

describe('nodeDynamicImport deprecation surface (b00237 S1)', () => {
	it('reports TS6385 only for the deprecated root import', () => {
		const workspace = mkdtempSync(resolve(tmpdir(), 'b00237-ts-'));
		try {
			const options = {
				target: typescript.ScriptTarget.ES2022,
				module: typescript.ModuleKind.ESNext,
				moduleResolution: typescript.ModuleResolutionKind.Bundler,
				strict: true,
				noEmit: true,
				baseUrl: REPO_ROOT,
				paths: {
					'@delendai/core': ['packages/core/src/index.ts'],
					'@delendai/core/node': ['packages/core/src/node/index.ts'],
				},
			};
			const files = {
				root: resolve(workspace, 'root.ts'),
				node: resolve(workspace, 'node.ts'),
			};
			writeFileSync(
				files.root,
				"import { nodeDynamicImport } from '@delendai/core';\nnodeDynamicImport;\n",
			);
			writeFileSync(
				files.node,
				"import { nodeDynamicImport } from '@delendai/core/node';\nnodeDynamicImport;\n",
			);

			for (const [surface, fileName] of Object.entries(files)) {
				const compilerHost = typescript.createCompilerHost(options);
				const host = {
					...compilerHost,
					getScriptFileNames: () => [fileName],
					getScriptVersion: () => '1',
					getScriptSnapshot: (name: string) =>
						name === fileName
							? typescript.ScriptSnapshot.fromString(
									readFileSync(name, 'utf8'),
								)
							: typescript.ScriptSnapshot.fromString(
									compilerHost.readFile(name) ?? '',
								),
					getCurrentDirectory: () => REPO_ROOT,
					getCompilationSettings: () => options,
				};
				const diagnostics = typescript
					.createLanguageService(host)
					.getSuggestionDiagnostics(fileName);
				const deprecationDiagnostics = diagnostics.filter(
					(diagnostic) => diagnostic.code === 6385,
				);

				const messages = deprecationDiagnostics.map((diagnostic) =>
					typescript.flattenDiagnosticMessageText(
						diagnostic.messageText,
						' ',
					),
				);
				if (surface === 'root') {
					expect(
						messages,
						`${surface} import diagnostics`,
					).not.toHaveLength(0);
					expect(
						messages.every(
							(message) =>
								message ===
								"'nodeDynamicImport' is deprecated.",
						),
					).toBe(true);
				} else {
					expect(messages, `${surface} import diagnostics`).toEqual(
						[],
					);
				}
			}
		} finally {
			rmSync(workspace, { recursive: true, force: true });
		}
	});

	it('keeps the deprecated public shim wired to the node subpath export', () => {
		expect(deprecatedPublicNodeDynamicImport).toBe(
			nodeSubpathDynamicImport,
		);
	});

	it('documents the root re-export as deprecated and points it at the node shim', () => {
		const barrel = readFileSync(PUBLIC_BARREL, 'utf8');
		expect(barrel).toContain('@deprecated r00028 / b00237');
		expect(barrel).toContain('use `@delendai/core/node` instead.');
		expect(barrel).toContain(
			'import { nodeDynamicImport as nodeDynamicImportImpl } from',
		);
		expect(barrel).toContain(
			'export const nodeDynamicImport = nodeDynamicImportImpl;',
		);
	});

	it('keeps the node subpath as the non-deprecated canonical owner', () => {
		const nodeBarrel = readFileSync(NODE_BARREL, 'utf8');
		const nodeShim = readFileSync(NODE_SHIM, 'utf8');
		expect(nodeBarrel).toContain(
			"export { nodeDynamicImport } from './dynamic-import';",
		);
		expect(nodeShim).toContain(
			"export { nodeDynamicImport } from '../lib/plugins/load-plugins';",
		);
		expect(nodeShim).not.toContain('@deprecated');
	});
});

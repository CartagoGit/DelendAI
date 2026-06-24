import { describe, expect, it } from 'vitest';

import { CONFIG_FILE_SCHEMA } from '@mcp-vertex/core/lib/plugins/config-file-schema';
import type {
	IBootstrapPatternOverride,
	IBootstrapPatternOverrides,
	ILoopDetectorConfig,
	IMcpVertexConfigFile,
	IMcpVertexCorePathsConfig,
	IMcpVertexPluginConfig,
	IValidationMatrixConfig,
	IValidationMatrixScope,
} from '@mcp-vertex/core/public';

describe('config-file-schema (Solid SRP extraction)', async () => {
	describe('schema shape (mirrors IMcpVertexConfigFile)', async () => {
		it('accepts a minimal valid config (empty object)', async () => {
			const res = CONFIG_FILE_SCHEMA.safeParse({});
			expect(res.success).toBe(true);
		});

		it('accepts a config with only the core paths', async () => {
			const res = CONFIG_FILE_SCHEMA.safeParse({
				cacheDir: '.cache/mcp-vertex',
				docsDir: 'docs/mcp-vertex',
			});
			expect(res.success).toBe(true);
		});

		it('accepts a config with validationMatrix', async () => {
			const res = CONFIG_FILE_SCHEMA.safeParse({
				validationMatrix: {
					scopes: {
						full: [{ command: 'bun test', expect: 'exit0' }],
					},
				},
			});
			expect(res.success).toBe(true);
		});

		it('accepts a config with plugins', async () => {
			const res = CONFIG_FILE_SCHEMA.safeParse({
				plugins: {
					proposals: {
						prefix: 'work',
						options: { validationCommand: 'bun run validate' },
					},
				},
			});
			expect(res.success).toBe(true);
		});

		it('accepts a config with loopDetector', async () => {
			const res = CONFIG_FILE_SCHEMA.safeParse({
				loopDetector: {
					enabled: true,
					repeatThreshold: 12,
					interactiveAgentPatterns: ['*-default', 'host'],
				},
			});
			expect(res.success).toBe(true);
		});

		it('accepts a config with bootstrap.patternOverrides', async () => {
			const res = CONFIG_FILE_SCHEMA.safeParse({
				bootstrap: {
					patternOverrides: {
						'custom-stack': {
							type: 'monorepo',
							describe: 'A custom monorepo stack',
							recommendedTools: [
								{
									name: 'pnpm',
									description: 'package manager',
								},
							],
							recommendedPlugins: ['deps'],
							knowledgeHints: ['docs/proposals'],
						},
					},
				},
			});
			expect(res.success).toBe(true);
		});

		it('rejects unknown keys at the root (.strict)', async () => {
			const res = CONFIG_FILE_SCHEMA.safeParse({ typoField: 'x' });
			expect(res.success).toBe(false);
		});

		it('rejects unknown keys inside loopDetector (.strict)', async () => {
			const res = CONFIG_FILE_SCHEMA.safeParse({
				loopDetector: { unknownLoopDetField: true },
			});
			expect(res.success).toBe(false);
		});

		it('rejects unknown keys inside bootstrap (.strict)', async () => {
			const res = CONFIG_FILE_SCHEMA.safeParse({
				bootstrap: { unknownBootstrapField: true },
			});
			expect(res.success).toBe(false);
		});
	});
});

describe('IMcpVertexConfigFile ISP segregation', async () => {
	it('IMcpVertexCorePathsConfig is structurally compatible with the parent', async () => {
		// Solid-LSP: a value typed as IMcpVertexCorePathsConfig is
		// assignable to IMcpVertexConfigFile (it extends it).
		const core: IMcpVertexCorePathsConfig = {
			cacheDir: '/x',
			docsDir: '/y',
			keepLegacy: true,
		};
		const asConfig: IMcpVertexConfigFile = core;
		expect(asConfig.cacheDir).toBe('/x');
		expect(asConfig.keepLegacy).toBe(true);
	});

	it('IValidationMatrixConfig narrows the validationMatrix field', async () => {
		const scopes: IValidationMatrixConfig = {
			scopes: {
				full: [
					{
						command: 'bun test',
						expect: 'exit0',
					} satisfies IValidationMatrixScope,
				],
			},
		};
		const asConfig: IMcpVertexConfigFile = { validationMatrix: scopes };
		expect(asConfig.validationMatrix?.scopes.full?.[0]?.command).toBe(
			'bun test',
		);
	});

	it('IBootstrapPatternOverride covers every shape of an override entry', async () => {
		const override: IBootstrapPatternOverride = {
			type: 'library',
			describe: 'A TypeScript library',
			recommendedTools: [{ name: 'vitest', description: 'test runner' }],
			recommendedPlugins: ['memory'],
			knowledgeHints: ['docs/library-conventions'],
		};
		const overrides: IBootstrapPatternOverrides = {
			patternOverrides: { 'ts-lib': override },
		};
		const asConfig: IMcpVertexConfigFile = { bootstrap: overrides };
		expect(asConfig.bootstrap?.patternOverrides?.['ts-lib']?.type).toBe(
			'library',
		);
	});

	it('ILoopDetectorConfig keeps its interactiveAgentPatterns contract', async () => {
		const ld: ILoopDetectorConfig = {
			enabled: false,
			interactiveAgentPatterns: [],
		};
		const asConfig: IMcpVertexConfigFile = { loopDetector: ld };
		expect(asConfig.loopDetector?.interactiveAgentPatterns).toEqual([]);
	});

	it('IMcpVertexPluginConfig keeps the per-plugin {prefix, options} contract', async () => {
		const pc: IMcpVertexPluginConfig = {
			prefix: 'work',
			options: { docsDir: '/x' },
		};
		const asConfig: IMcpVertexConfigFile = {
			plugins: { proposals: pc },
		};
		expect(asConfig.plugins?.proposals?.prefix).toBe('work');
		expect(asConfig.plugins?.proposals?.options).toEqual({ docsDir: '/x' });
	});
});

describe('LSP — sub-interfaces compose into IMcpVertexConfigFile', async () => {
	it('every sub-interface is a structural subset of the composite', async () => {
		// This is the Solid-LSP guard: a function typed against the
		// composite must accept values typed against any sub-interface.
		const consumer = (c: IMcpVertexConfigFile): string =>
			`${c.cacheDir ?? ''}|${c.docsDir ?? ''}`;
		const onlyPaths: IMcpVertexCorePathsConfig = {
			cacheDir: '/a',
			docsDir: '/b',
		};
		expect(consumer(onlyPaths)).toBe('/a|/b');
	});
});

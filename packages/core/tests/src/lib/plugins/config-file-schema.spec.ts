import { describe, expect, it } from 'vitest';

import { CONFIG_FILE_SCHEMA } from '@mcp-vertex/core/lib/plugins/config-file-schema';
import type {
	IBootstrapPatternOverride,
	IBootstrapPatternOverrides,
	IFilesystemConfig,
	ILoopDetectorConfig,
	IMcpVertexCachePolicyConfig,
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
						enabled: false,
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

		it('accepts a config with a cache policy block (f00072 S3)', async () => {
			const res = CONFIG_FILE_SCHEMA.safeParse({
				cache: {
					runOnBoot: 'apply',
					maxAgeDays: 14,
					worktrees: { enabled: true, keepLastN: 3 },
				},
			});
			expect(res.success).toBe(true);
		});

		it('accepts an empty cache block (defaults to dry-run)', async () => {
			const res = CONFIG_FILE_SCHEMA.safeParse({ cache: {} });
			expect(res.success).toBe(true);
		});

		it('rejects an unknown runOnBoot mode in the cache block', async () => {
			const res = CONFIG_FILE_SCHEMA.safeParse({
				cache: { runOnBoot: 'sometimes' },
			});
			expect(res.success).toBe(false);
		});

		it('rejects unknown keys inside cache (.strict)', async () => {
			const res = CONFIG_FILE_SCHEMA.safeParse({
				cache: { unknownCacheField: true },
			});
			expect(res.success).toBe(false);
		});

		it('rejects unknown keys inside cache.worktrees (.strict)', async () => {
			const res = CONFIG_FILE_SCHEMA.safeParse({
				cache: { worktrees: { unknownWtField: true } },
			});
			expect(res.success).toBe(false);
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
							knowledgeHints: ['docs/mcp-vertex/proposals'],
						},
					},
				},
			});
			expect(res.success).toBe(true);
		});

		it('accepts a config with filesystem.authorizedRoots (f00089 U5)', async () => {
			const res = CONFIG_FILE_SCHEMA.safeParse({
				filesystem: {
					authorizedRoots: ['/data/shared', '/srv/docs'],
				},
			});
			expect(res.success).toBe(true);
		});

		it('accepts an empty filesystem block (allowlist off by default)', async () => {
			const res = CONFIG_FILE_SCHEMA.safeParse({ filesystem: {} });
			expect(res.success).toBe(true);
		});

		it('rejects unknown keys inside filesystem (.strict)', async () => {
			const res = CONFIG_FILE_SCHEMA.safeParse({
				filesystem: { unknownFsField: true },
			});
			expect(res.success).toBe(false);
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

	describe('root-level providers roster (f00067a S1)', async () => {
		/** A valid entry per invoke kind — mirrors IProviderCapabilities. */
		const apiProvider = {
			id: 'gpt-5-api',
			kind: 'api',
			invoke: {
				kind: 'api',
				url: 'https://api.openai.com/v1/responses',
				envVar: 'OPENAI_API_KEY',
			},
			modelId: 'gpt-5',
			contextWindow: 400_000,
			costTier: 4,
			strengths: ['reasoning', 'json-strict'],
			weaknesses: ['fast-iteration'],
		};
		const cliProvider = {
			id: 'claude-cli',
			kind: 'cli',
			invoke: { kind: 'cli', command: 'claude', args: ['-p'] },
			modelId: 'claude-sonnet',
			contextWindow: 200_000,
			costTier: 3,
			strengths: ['code-edit', 'agentic'],
			weaknesses: [],
		};
		const subscriptionProvider = {
			id: 'copilot-sub',
			kind: 'subscription',
			invoke: { kind: 'subscription', tool: 'vscode-copilot' },
			modelId: 'gpt-5-mini',
			contextWindow: 128_000,
			costTier: 1,
			strengths: ['fast-iteration'],
			weaknesses: ['very-long-context'],
		};
		const mcpProvider = {
			id: 'codex-mcp',
			kind: 'mcp-server',
			invoke: {
				kind: 'mcp-server',
				server: 'codex',
				tool: 'codex-exec',
				args: { sandbox: 'read-only' },
			},
			modelId: 'gpt-5-codex',
			contextWindow: 272_000,
			costTier: 2,
			strengths: ['code-edit'],
			weaknesses: [],
		};

		it('is optional: an absent providers key still validates', async () => {
			const res = CONFIG_FILE_SCHEMA.safeParse({ cacheDir: '.cache' });
			expect(res.success).toBe(true);
		});

		it('accepts an empty roster', async () => {
			const res = CONFIG_FILE_SCHEMA.safeParse({ providers: [] });
			expect(res.success).toBe(true);
		});

		it('accepts a roster covering all four invoke kinds', async () => {
			const res = CONFIG_FILE_SCHEMA.safeParse({
				providers: [
					apiProvider,
					cliProvider,
					subscriptionProvider,
					mcpProvider,
				],
			});
			expect(res.success).toBe(true);
		});

		it('rejects a non-kebab-case id', async () => {
			for (const badId of ['GPT-5', '5-gpt', 'gpt_5', 'g']) {
				const res = CONFIG_FILE_SCHEMA.safeParse({
					providers: [{ ...apiProvider, id: badId }],
				});
				expect(res.success, `id "${badId}" should be rejected`).toBe(
					false,
				);
			}
		});

		it('rejects an unknown kind', async () => {
			const res = CONFIG_FILE_SCHEMA.safeParse({
				providers: [{ ...apiProvider, kind: 'webhook' }],
			});
			expect(res.success).toBe(false);
		});

		it('rejects duplicate provider ids (superRefine)', async () => {
			const res = CONFIG_FILE_SCHEMA.safeParse({
				providers: [
					apiProvider,
					{ ...cliProvider, id: apiProvider.id },
				],
			});
			expect(res.success).toBe(false);
			if (!res.success) {
				expect(
					res.error.issues.some((issue) =>
						issue.message.includes('duplicate provider id'),
					),
				).toBe(true);
			}
		});

		it('rejects a mixed invoke shape (api url + cli command)', async () => {
			const res = CONFIG_FILE_SCHEMA.safeParse({
				providers: [
					{
						...apiProvider,
						invoke: { ...apiProvider.invoke, command: 'claude' },
					},
				],
			});
			expect(res.success).toBe(false);
		});

		it('rejects an out-of-range costTier', async () => {
			const res = CONFIG_FILE_SCHEMA.safeParse({
				providers: [{ ...apiProvider, costTier: 6 }],
			});
			expect(res.success).toBe(false);
		});

		it('rejects an unknown capability tag in strengths', async () => {
			const res = CONFIG_FILE_SCHEMA.safeParse({
				providers: [{ ...apiProvider, strengths: ['clairvoyance'] }],
			});
			expect(res.success).toBe(false);
		});

		it('rejects unknown keys inside a provider entry (.strict)', async () => {
			const res = CONFIG_FILE_SCHEMA.safeParse({
				providers: [{ ...apiProvider, apiKey: 'sk-nope' }],
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
			enabled: false,
			prefix: 'work',
			options: { docsDir: '/x' },
		};
		const asConfig: IMcpVertexConfigFile = {
			plugins: { proposals: pc },
		};
		expect(asConfig.plugins?.proposals?.prefix).toBe('work');
		expect(asConfig.plugins?.proposals?.enabled).toBe(false);
		expect(asConfig.plugins?.proposals?.options).toEqual({ docsDir: '/x' });
	});

	it('IFilesystemConfig narrows the filesystem.authorizedRoots field (f00089 U5)', async () => {
		const fs: IFilesystemConfig = { authorizedRoots: ['/data/shared'] };
		const asConfig: IMcpVertexConfigFile = { filesystem: fs };
		expect(asConfig.filesystem?.authorizedRoots).toEqual(['/data/shared']);
	});

	it('IMcpVertexCachePolicyConfig narrows the cache field (f00072 S3)', async () => {
		const cache: IMcpVertexCachePolicyConfig = {
			runOnBoot: 'dry-run',
			maxAgeDays: 30,
			worktrees: { enabled: true, keepLastN: 3 },
		};
		const asConfig: IMcpVertexConfigFile = { cache };
		expect(asConfig.cache?.runOnBoot).toBe('dry-run');
		expect(asConfig.cache?.worktrees?.keepLastN).toBe(3);
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

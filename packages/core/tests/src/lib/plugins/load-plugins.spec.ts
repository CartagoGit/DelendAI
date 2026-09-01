import { describe, expect, it } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import {
	loadPlugins,
	nodeDynamicImport,
	resolvePluginSpecifier,
} from '@mcp-vertex/core/lib/plugins/load-plugins';
import type { IMcpPluginContext } from '@mcp-vertex/core/lib/plugins/plugin-contract';

const ctx = (name: string, cacheNamespace?: string): IMcpPluginContext => ({
	workspace: { root: '/ws', resolve: (p: string) => `/ws/${p}` },
	corePaths: { cacheDir: '.cache/mcp-vertex', docsDir: 'docs/mcp-vertex' },
	cacheDir: '.cache/mcp-vertex',
	docsDir: 'docs/mcp-vertex',
	keepLegacy: false,
	pluginCacheDir: `.cache/mcp-vertex/${cacheNamespace ? `${cacheNamespace}/${name}` : name}`,
	pluginDocsDir: `docs/mcp-vertex/${name}`,
	namespacePrefix: name,
	options: {},
	args: {},
});

describe('resolvePluginSpecifier', async () => {
	it('expands a bare short name to the scoped convention first', async () => {
		expect(resolvePluginSpecifier('proposals')).toEqual([
			'@mcp-vertex/proposals',
			'mcp-proposals',
			'proposals',
		]);
	});
	it('uses a path or explicit package verbatim', async () => {
		expect(resolvePluginSpecifier('./local.ts')).toEqual(['./local.ts']);
		expect(resolvePluginSpecifier('@scope/pkg')).toEqual(['@scope/pkg']);
	});
});

describe('nodeDynamicImport runtime package resolution', async () => {
	it('loads a local first-party package from source when a workspace is provided', async () => {
		const loaded = (await nodeDynamicImport(
			'@mcp-vertex/proposals',
			process.cwd(),
		)) as { default?: { readonly name?: string } };
		expect(loaded.default?.name).toBe('proposals');
	});

	it('preserves package resolution for consumers outside the monorepo', async () => {
		await expect(
			nodeDynamicImport('@mcp-vertex/not-a-local-plugin', process.cwd()),
		).rejects.toThrow(
			/local first-party plugin source not found.*Package resolution also failed/,
		);
	});
});

describe('loadPlugins', async () => {
	it('loads a plugin via injected importer and merges its registrations', async () => {
		const fakePlugin = {
			name: 'demo',
			register: () => ({
				tools: [{ id: 'demo_x', register: async () => {} }],
			}),
		};
		const result = await loadPlugins({
			specifiers: ['demo'],
			buildContext: ctx,
			import: async () => ({ default: fakePlugin }),
		});
		expect(result.errors).toEqual([]);
		expect(result.loaded[0]?.plugin.name).toBe('demo');
		expect(result.loaded[0]?.registrations.tools?.[0]?.id).toBe('demo_x');
	});

	it('blocks registration when plugins report a configuration conflict', async () => {
		let registered = false;
		const conflict = {
			name: 'conflict',
			validateConfiguration: () => [
				{
					code: 'TEST_CONFLICT',
					message: 'two settings disagree',
					keys: ['plugins.a.options.mode', 'plugins.b.options.mode'],
					suggestedConfig: {
						plugins: { a: { options: { mode: 'safe' } } },
					},
				},
			],
			register: () => {
				registered = true;
				return { tools: [] };
			},
		};
		const result = await loadPlugins({
			specifiers: ['conflict'],
			buildContext: ctx,
			import: async () => ({ default: conflict }),
		});
		expect(result.loaded).toEqual([]);
		expect(result.registerErrors).toEqual([]);
		expect(registered).toBe(false);
		expect(result.errors[0]?.specifier).toBe('configuration');
		expect(result.errors[0]?.message).toContain('TEST_CONFLICT');
		expect(result.errors[0]?.message).toContain('plugins.a.options.mode');
		expect(result.errors[0]?.message).toContain(
			'mcp-vertex.config.json patch',
		);
	});

	it('a00063: threads a plugin-declared cacheNamespace into buildContext, nesting pluginCacheDir', async () => {
		let seenPluginCacheDir = '';
		const fakePlugin = {
			name: 'logs',
			cacheNamespace: 'results' as const,
			register: (pluginCtx: IMcpPluginContext) => {
				seenPluginCacheDir = pluginCtx.pluginCacheDir;
				return { tools: [] };
			},
		};
		const result = await loadPlugins({
			specifiers: ['logs'],
			buildContext: ctx,
			import: async () => ({ default: fakePlugin }),
		});
		expect(result.errors).toEqual([]);
		expect(seenPluginCacheDir).toBe('.cache/mcp-vertex/results/logs');
	});

	it('dedups a plugin requested twice (loads once, notes the dup)', async () => {
		const p = { name: 'demo', register: () => ({}) };
		const result = await loadPlugins({
			specifiers: ['demo', 'demo'],
			buildContext: ctx,
			import: async () => ({ default: p }),
		});
		expect(result.loaded).toHaveLength(1);
		expect(result.errors[0]?.message).toMatch(/duplicate/);
	});

	it('times out a hanging import instead of blocking forever', async () => {
		const result = await loadPlugins({
			specifiers: ['slow'],
			buildContext: ctx,
			timeoutMs: 20,
			import: () => new Promise(() => {}), // never resolves
		});
		expect(result.loaded).toHaveLength(0);
		expect(result.errors[0]?.message).toMatch(/timed out/);
	});

	it('collects errors without aborting the rest', async () => {
		const ok = {
			name: 'ok',
			register: () => ({}),
		};
		const result = await loadPlugins({
			specifiers: ['bad', 'ok'],
			buildContext: ctx,
			import: async (specifier: string) => {
				if (specifier.includes('ok')) return { default: ok };
				throw new Error('not found');
			},
		});
		expect(result.loaded.map((entry) => entry.plugin.name)).toEqual(['ok']);
		expect(result.errors[0]?.specifier).toBe('bad');
		expect(result.registerErrors).toEqual([]);
	});

	it('loads a plugin from an absolute path specifier', async () => {
		const pluginDir = mkdtempSync(join(tmpdir(), 'mcp-vertex-plugin-'));
		const pluginPath = join(pluginDir, 'index.js');
		writeFileSync(
			pluginPath,
			'export default { name: "local-demo", register: () => ({ tools: [] }) };',
		);
		const importCalls: string[] = [];
		const result = await loadPlugins({
			specifiers: [pluginPath],
			workspaceRoot: '/ws',
			buildContext: ctx,
			import: async (specifier: string) => {
				importCalls.push(specifier);
				return {
					default: {
						name: 'local-demo',
						register: () => ({ tools: [] }),
					},
				};
			},
		});
		expect(result.errors).toEqual([]);
		expect(importCalls).toEqual([pluginPath]);
		expect(result.loaded[0]?.plugin.name).toBe('local-demo');
		expect(result.loaded[0]?.resolved).toBe(pluginPath);
	});

	it('resolves a relative path specifier against the workspace root', async () => {
		const workspace = mkdtempSync(join(tmpdir(), 'mcp-vertex-workspace-'));
		const pluginDir = join(workspace, 'plugins', 'my-plugin');
		mkdirSync(pluginDir, { recursive: true });
		const pluginPath = join(pluginDir, 'index.js');
		writeFileSync(
			pluginPath,
			'export default { name: "my-plugin", register: () => ({ tools: [] }) };',
		);
		const importCalls: string[] = [];
		const result = await loadPlugins({
			specifiers: ['./plugins/my-plugin/index.js'],
			workspaceRoot: workspace,
			buildContext: ctx,
			import: async (specifier: string) => {
				importCalls.push(specifier);
				return {
					default: {
						name: 'my-plugin',
						register: () => ({ tools: [] }),
					},
				};
			},
		});
		expect(result.errors).toEqual([]);
		expect(importCalls).toEqual([pluginPath]);
		expect(result.loaded[0]?.plugin.name).toBe('my-plugin');
		expect(result.loaded[0]?.resolved).toBe(pluginPath);
	});

	it('reports a clear error for a missing explicit path', async () => {
		const result = await loadPlugins({
			specifiers: ['/definitely/missing/plugin.js'],
			workspaceRoot: '/ws',
			buildContext: ctx,
			import: async () => {
				throw new Error('should not import');
			},
		});
		expect(result.loaded).toHaveLength(0);
		expect(result.errors[0]?.message).toMatch(/plugin path does not exist/);
		expect(result.errors[0]?.message).toMatch(
			/\/definitely\/missing\/plugin\.js/,
		);
	});

	it('a00065 S6: does NOT call register() of a plugin whose dependsOn is unmet', async () => {
		// A depends on B; B is not in the load set. register() has a
		// side effect (a real third-party plugin might start a timer,
		// open a socket, or write a file here). The dependency check
		// must run BEFORE any register(), so A's side effect never fires
		// when the batch is going to be rejected.
		let aRegistered = false;
		const A = {
			name: 'a',
			dependsOn: ['b'],
			register: () => {
				aRegistered = true;
				return { tools: [] };
			},
		};
		const result = await loadPlugins({
			specifiers: ['a'],
			buildContext: ctx,
			import: async () => ({ default: A }),
		});
		expect(result.loaded).toEqual([]);
		expect(
			result.errors.some(
				(e) =>
					e.specifier === '(dependsOn)' ||
					/requires|depend/i.test(e.message),
			),
		).toBe(true);
		expect(aRegistered).toBe(false);
		expect(result.registerErrors).toEqual([
			expect.objectContaining({
				pluginName: 'a',
				phase: 'dependency',
				missingDependencies: ['b'],
			}),
		]);
	});

	it('a00065 S6: a satisfied dependency still registers both plugins', async () => {
		const B = { name: 'b', register: () => ({ tools: [] }) };
		const A = {
			name: 'a',
			dependsOn: ['b'],
			register: () => ({ tools: [] }),
		};
		const result = await loadPlugins({
			specifiers: ['a', 'b'],
			buildContext: ctx,
			import: async (spec: string) => ({
				default:
					spec.includes('a') && !spec.includes('b')
						? A
						: spec.includes('b')
							? B
							: A,
			}),
		});
		expect(result.errors).toEqual([]);
		expect(result.loaded.map((l) => l.plugin.name).sort()).toEqual([
			'a',
			'b',
		]);
	});

	it('captures register() failures as registerErrors with the resolved specifier', async () => {
		const result = await loadPlugins({
			specifiers: ['broken'],
			buildContext: ctx,
			import: async () => ({
				default: {
					name: 'broken',
					register: () => {
						throw new Error('register boom');
					},
				},
			}),
		});
		expect(result.loaded).toEqual([]);
		expect(result.registerErrors).toEqual([
			expect.objectContaining({
				pluginName: 'broken',
				resolvedSpecifier: '@mcp-vertex/broken',
				phase: 'register',
			}),
		]);
		expect(result.errors[0]?.message).toMatch(/register\(\) failed/);
	});
});

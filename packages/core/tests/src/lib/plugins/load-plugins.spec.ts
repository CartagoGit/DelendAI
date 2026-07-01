import { describe, expect, it } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import {
	loadPlugins,
	resolvePluginSpecifier,
} from '@mcp-vertex/core/lib/plugins/load-plugins';
import type { IMcpPluginContext } from '@mcp-vertex/core/lib/plugins/plugin-contract';

const ctx = (name: string): IMcpPluginContext => ({
	workspace: { root: '/ws', resolve: (p: string) => `/ws/${p}` },
	corePaths: { cacheDir: '.cache/mcp-vertex', docsDir: 'docs/mcp-vertex' },
	cacheDir: '.cache/mcp-vertex',
	docsDir: 'docs/mcp-vertex',
	keepLegacy: false,
	pluginCacheDir: `.cache/mcp-vertex/${name}`,
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
	});

	it('loads a plugin from an absolute path specifier', async () => {
		const pluginDir = mkdtempSync(join(tmpdir(), 'mcp-vertex-plugin-'));
		const pluginPath = join(pluginDir, 'index.js');
		writeFileSync(pluginPath, 'export default { name: "local-demo", register: () => ({ tools: [] }) };');
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
		writeFileSync(pluginPath, 'export default { name: "my-plugin", register: () => ({ tools: [] }) };');
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
		expect(result.errors[0]?.message).toMatch(/\/definitely\/missing\/plugin\.js/);
	});
});

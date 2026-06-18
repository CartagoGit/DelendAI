import { describe, expect, it } from 'vitest';

import {
	loadPlugins,
	resolvePluginSpecifier,
} from '@mcp-vertex/core/lib/plugins/load-plugins';
import type { IMcpPluginContext } from '@mcp-vertex/core/lib/plugins/plugin-contract';

const ctx = (name: string): IMcpPluginContext => ({
	workspace: { root: '/ws', resolve: (p: string) => `/ws/${p}` },
	corePaths: { cacheDir: '.cache/mcp-core', docsDir: 'docs/mcp-core' },
	cacheDir: '.cache/mcp-core',
	docsDir: 'docs/mcp-core',
	pluginCacheDir: `.cache/mcp-core/${name}`,
	pluginDocsDir: `docs/mcp-core/${name}`,
	namespacePrefix: name,
	options: {},
	args: {},
});

describe('resolvePluginSpecifier', () => {
	it('expands a bare short name to the scoped convention first', () => {
		expect(resolvePluginSpecifier('proposals')).toEqual([
			'@mcp-vertex/proposals',
			'mcp-proposals',
			'proposals',
		]);
	});
	it('uses a path or explicit package verbatim', () => {
		expect(resolvePluginSpecifier('./local.ts')).toEqual(['./local.ts']);
		expect(resolvePluginSpecifier('@scope/pkg')).toEqual(['@scope/pkg']);
	});
});

describe('loadPlugins', () => {
	it('loads a plugin via injected importer and merges its registrations', async () => {
		const fakePlugin = {
			name: 'demo',
			register: () => ({ tools: [{ id: 'demo_x', register: async () => {} }] }),
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
});

import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import { loadPlugins } from '@mcp-vertex/core/lib/plugins/load-plugins';
import type { IMcpPluginContext } from '@mcp-vertex/core/lib/plugins/plugin-contract';

const ctx = (
	name: string,
	cacheNamespace?: string,
	options: Record<string, unknown> = {},
): IMcpPluginContext => ({
	workspace: { root: '/ws', resolve: (p: string) => `/ws/${p}` },
	corePaths: { cacheDir: '.cache/mcp-vertex', docsDir: 'docs/mcp-vertex' },
	cacheDir: '.cache/mcp-vertex',
	docsDir: 'docs/mcp-vertex',
	keepLegacy: false,
	pluginCacheDir: `.cache/mcp-vertex/${cacheNamespace ? `${cacheNamespace}/${name}` : name}`,
	pluginDocsDir: `docs/mcp-vertex/${name}`,
	namespacePrefix: name,
	options,
	args: {},
});

describe('loadPlugins parsed options', async () => {
	it('passes Zod-coerced, defaulted, trimmed and transformed options into register()', async () => {
		const seen: Record<string, unknown>[] = [];
		const parsedPlugin = {
			name: 'parsed',
			optionsSchema: z.object({
				retries: z.coerce.number().default(3),
				label: z.string().trim(),
				mode: z.string().transform((value) => value.toUpperCase()),
			}),
			register: (pluginCtx: IMcpPluginContext) => {
				seen.push(pluginCtx.options);
				return {};
			},
		};

		const result = await loadPlugins({
			specifiers: ['parsed'],
			buildContext: (name, cacheNamespace) =>
				ctx(name, cacheNamespace, {
					retries: '5',
					label: '  hello  ',
					mode: 'mixedCase',
				}),
			import: async () => ({ default: parsedPlugin }),
		});

		expect(result.errors).toEqual([]);
		expect(result.loaded).toHaveLength(1);
		expect(seen).toHaveLength(1);
		expect(seen[0]?.retries).toBe(5);
		expect(typeof seen[0]?.retries).toBe('number');
		expect(seen[0]?.label).toBe('hello');
		expect(seen[0]?.mode).toBe('MIXEDCASE');
	});

	it('reports invalid plugin options from the loader and never calls register()', async () => {
		let registerCalled = false;
		const strictPlugin = {
			name: 'strict',
			optionsSchema: z.object({
				retries: z.coerce.number().min(1),
				label: z.string().trim().min(1),
			}),
			register: () => {
				registerCalled = true;
				return {};
			},
		};

		const result = await loadPlugins({
			specifiers: ['strict'],
			buildContext: (name, cacheNamespace) =>
				ctx(name, cacheNamespace, {
					retries: '0',
					label: '   ',
				}),
			import: async () => ({ default: strictPlugin }),
		});

		expect(result.loaded).toEqual([]);
		expect(registerCalled).toBe(false);
		expect(result.registerErrors).toEqual([]);
		expect(result.errors).toHaveLength(1);
		expect(result.errors[0]?.message).toMatch(/rejected its options/);
		expect(result.errors[0]?.message).toMatch(/plugins\.strict\.options/);
	});
});

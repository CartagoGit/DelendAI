import { describe, expect, it } from 'vitest';

import { loadPlugins } from '@delendai/core/lib/plugins/load-plugins';
import type { IMcpPluginContext } from '@delendai/core/lib/plugins/plugin-contract';

const ctx = (name: string, cacheNamespace?: string): IMcpPluginContext => ({
	workspace: { root: '/ws', resolve: (path: string) => `/ws/${path}` },
	corePaths: { cacheDir: '.cache/delendai', docsDir: 'docs/delendai' },
	cacheDir: '.cache/delendai',
	docsDir: 'docs/delendai',
	keepLegacy: false,
	pluginCacheDir: `.cache/delendai/${cacheNamespace ? `${cacheNamespace}/${name}` : name}`,
	pluginDocsDir: `docs/delendai/${name}`,
	namespacePrefix: name,
	options: {},
	args: {},
});

describe('loadPlugins dependency lifecycle', async () => {
	it('registers in topological order and blocks a dependent when its dependency fails', async () => {
		const calls: string[] = [];
		const plugins = {
			a: {
				name: 'a',
				dependsOn: ['b'],
				register: () => {
					calls.push('a');
					return { tools: [] };
				},
			},
			b: {
				name: 'b',
				register: () => {
					calls.push('b');
					throw new Error('b boom');
				},
			},
		};

		const result = await loadPlugins({
			specifiers: ['a', 'b'],
			buildContext: ctx,
			import: async (specifier: string) => ({
				default:
					specifier.includes('/a') && !specifier.includes('/b')
						? plugins.a
						: plugins.b,
			}),
		});

		expect(calls).toEqual(['b']);
		expect(result.loaded).toEqual([]);
		expect(result.errors).toEqual(
			expect.arrayContaining([
				expect.objectContaining({
					message: expect.stringMatching(
						/plugin "a" blocked because dependency "b" failed to register/,
					),
				}),
			]),
		);
		expect(result.registerErrors).toEqual(
			expect.arrayContaining([
				expect.objectContaining({
					pluginName: 'b',
					phase: 'register',
					lifecycleState: 'failed',
				}),
				expect.objectContaining({
					pluginName: 'a',
					phase: 'dependency',
					dependencyFailureType: 'failed',
					blockedBy: ['b'],
					lifecycleState: 'blocked',
				}),
			]),
		);
	});

	it('detects dependency cycles before running register side effects', async () => {
		let registerCalls = 0;
		const plugins = {
			a: {
				name: 'a',
				dependsOn: ['b'],
				register: () => {
					registerCalls += 1;
					return { tools: [] };
				},
			},
			b: {
				name: 'b',
				dependsOn: ['c'],
				register: () => {
					registerCalls += 1;
					return { tools: [] };
				},
			},
			c: {
				name: 'c',
				dependsOn: ['a'],
				register: () => {
					registerCalls += 1;
					return { tools: [] };
				},
			},
		};

		const result = await loadPlugins({
			specifiers: ['a', 'b', 'c'],
			buildContext: ctx,
			import: async (specifier: string) => {
				if (
					specifier.includes('/a') &&
					!specifier.includes('/b') &&
					!specifier.includes('/c')
				) {
					return { default: plugins.a };
				}
				if (specifier.includes('/b') && !specifier.includes('/c')) {
					return { default: plugins.b };
				}
				return { default: plugins.c };
			},
		});

		expect(registerCalls).toBe(0);
		expect(result.loaded).toEqual([]);
		expect(result.errors[0]?.message).toMatch(
			/plugin dependency cycle detected: a -> b -> c -> a/,
		);
		expect(
			result.registerErrors.every(
				(error) =>
					error.phase === 'dependency' &&
					error.dependencyFailureType === 'cycle',
			),
		).toBe(true);
	});

	it('ignores duplicate plugin names and still respects dependency order', async () => {
		const calls: string[] = [];
		const plugins = {
			a: {
				name: 'a',
				dependsOn: ['b'],
				register: () => {
					calls.push('a');
					return { tools: [] };
				},
			},
			b: {
				name: 'b',
				register: () => {
					calls.push('b');
					return { tools: [] };
				},
			},
		};

		const result = await loadPlugins({
			specifiers: ['alias-a', 'b', 'a'],
			buildContext: ctx,
			import: async (specifier: string) => {
				if (specifier.includes('/b')) return { default: plugins.b };
				return { default: plugins.a };
			},
		});

		expect(calls).toEqual(['b', 'a']);
		expect(result.loaded.map((entry) => entry.plugin.name)).toEqual([
			'b',
			'a',
		]);
		expect(result.errors).toEqual(
			expect.arrayContaining([
				expect.objectContaining({
					message: expect.stringMatching(
						/already loaded|duplicate ignored/,
					),
				}),
			]),
		);
	});

	it('blocks dependents in cascade when an upstream dependency fails', async () => {
		const calls: string[] = [];
		const plugins = {
			c: {
				name: 'c',
				dependsOn: ['a'],
				register: () => {
					calls.push('c');
					return { tools: [] };
				},
			},
			a: {
				name: 'a',
				dependsOn: ['b'],
				register: () => {
					calls.push('a');
					return { tools: [] };
				},
			},
			b: {
				name: 'b',
				register: () => {
					calls.push('b');
					throw new Error('b boom');
				},
			},
		};

		const result = await loadPlugins({
			specifiers: ['c', 'a', 'b'],
			buildContext: ctx,
			import: async (specifier: string) => {
				if (specifier.includes('/c')) return { default: plugins.c };
				if (specifier.includes('/a') && !specifier.includes('/b')) {
					return { default: plugins.a };
				}
				return { default: plugins.b };
			},
		});

		expect(calls).toEqual(['b']);
		expect(result.loaded).toEqual([]);
		expect(result.registerErrors).toEqual(
			expect.arrayContaining([
				expect.objectContaining({
					pluginName: 'a',
					phase: 'dependency',
					dependencyFailureType: 'failed',
					blockedBy: ['b'],
				}),
				expect.objectContaining({
					pluginName: 'c',
					phase: 'dependency',
					dependencyFailureType: 'blocked',
					blockedBy: ['a'],
				}),
			]),
		);
		expect(result.errors).toEqual(
			expect.arrayContaining([
				expect.objectContaining({
					message: expect.stringMatching(
						/plugin "c" blocked because dependency "a" is blocked/,
					),
				}),
			]),
		);
	});
});

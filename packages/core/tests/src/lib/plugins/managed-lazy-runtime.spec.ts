import z from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

import { describe, expect, it } from 'vitest';

import { createManagedLazyRuntime } from '@delendai/core/lib/plugins/managed-lazy-runtime';

describe('managed lazy plugin runtime', () => {
	it('imports once for concurrent first-use activation and captures the real schema', async () => {
		let imports = 0;
		const runtime = createManagedLazyRuntime({
			namespacePrefix: 'mcp-vertex',
			plugins: [
				{
					id: 'demo',
					packageSpecifier: '@delendai/demo',
					toolIds: ['echo'],
					promptIds: [],
					resourceIds: [],
					knowledgeIds: [],
					skillIds: [],
					dependencies: [],
				},
			],
			namespaces: new Map([['demo', 'demo']]),
			buildContext: () => ({}) as never,
			importFn: async () => {
				imports += 1;
				return {
					default: {
						name: 'demo',
						register: async () => ({
							tools: [
								{
									id: 'echo',
									register: async (server: McpServer) => {
										server.registerTool(
											'mcp-vertex_demo_echo',
											{
												description: 'Echo',
												inputSchema: z.object({
													value: z.string(),
												}),
												outputSchema: z.object({
													value: z.string(),
												}),
											},
											async (args: {
												value: string;
											}) => ({
												content: [
													{
														type: 'text',
														text: args.value,
													},
												],
											}),
										);
									},
								},
							],
						}),
					},
				};
			},
		});

		const registrationId = 'mcp-vertex_demo_echo';
		const [first, second] = await Promise.all([
			runtime.activateTool(registrationId),
			runtime.activateTool(registrationId),
		]);
		expect(imports).toBe(1);
		expect(first.inputSchema).toBeDefined();
		expect(second.outputSchema).toBeDefined();
		const result = await (
			first.handler as (args: { value: string }) => Promise<unknown>
		)({ value: 'ok' });
		expect(result).toEqual({
			content: [{ type: 'text', text: 'ok' }],
		});
		expect(runtime.snapshot()).toEqual({
			loadedPluginIds: ['demo'],
			activatedToolIds: ['demo:echo'],
		});
	});

	it('activates dependencies before the requested plugin', async () => {
		const calls: string[] = [];
		const runtime = createManagedLazyRuntime({
			namespacePrefix: 'mcp-vertex',
			plugins: [
				{
					id: 'app',
					packageSpecifier: '@delendai/app',
					toolIds: ['run'],
					promptIds: [],
					resourceIds: [],
					knowledgeIds: [],
					skillIds: [],
					dependencies: ['shared'],
				},
				{
					id: 'shared',
					packageSpecifier: '@delendai/shared',
					toolIds: [],
					promptIds: [],
					resourceIds: [],
					knowledgeIds: [],
					skillIds: [],
					dependencies: [],
				},
			],
			namespaces: new Map([
				['app', 'app'],
				['shared', 'shared'],
			]),
			buildContext: () => ({}) as never,
			importFn: async (specifier) => ({
				default: {
					name: specifier.includes('/app') ? 'app' : 'shared',
					dependsOn: specifier.includes('/app') ? ['shared'] : [],
					register: () => {
						calls.push(specifier);
						return {
							tools: specifier.includes('/app')
								? [
										{
											id: 'run',
											register: async (
												server: McpServer,
											) => {
												server.registerTool(
													'mcp-vertex_app_run',
													{ description: 'Run' },
													async () => ({
														content: [
															{
																type: 'text',
																text: 'ok',
															},
														],
													}),
												);
											},
										},
									]
								: [],
						};
					},
				},
			}),
		});

		await runtime.activateTool('mcp-vertex_app_run');
		expect(calls).toEqual(['@delendai/shared', '@delendai/app']);
		expect(runtime.snapshot().loadedPluginIds).toEqual(['app', 'shared']);
	});

	it('reports a missing dependency without importing the dependent again', async () => {
		let imports = 0;
		const runtime = createManagedLazyRuntime({
			namespacePrefix: 'mcp-vertex',
			plugins: [
				{
					id: 'app',
					packageSpecifier: '@delendai/app',
					toolIds: [],
					promptIds: [],
					resourceIds: [],
					knowledgeIds: [],
					skillIds: [],
					dependencies: [],
				},
			],
			namespaces: new Map([['app', 'app']]),
			buildContext: () => ({}) as never,
			importFn: async () => {
				imports += 1;
				return {
					default: {
						name: 'app',
						dependsOn: ['missing'],
						register: () => ({ tools: [] }),
					},
				};
			},
		});

		await expect(runtime.activatePlugin('app')).rejects.toThrow(
			'requires unloaded dependency "missing"',
		);
		expect(imports).toBe(1);
		expect(runtime.snapshot()).toEqual({
			loadedPluginIds: [],
			activatedToolIds: [],
		});
	});

	it('reports a dependency registration failure and keeps the dependent unloaded', async () => {
		const failures: string[] = [];
		const runtime = createManagedLazyRuntime({
			namespacePrefix: 'mcp-vertex',
			plugins: [
				{
					id: 'app',
					packageSpecifier: '@delendai/app',
					toolIds: [],
					promptIds: [],
					resourceIds: [],
					knowledgeIds: [],
					skillIds: [],
					dependencies: ['shared'],
				},
				{
					id: 'shared',
					packageSpecifier: '@delendai/shared',
					toolIds: [],
					promptIds: [],
					resourceIds: [],
					knowledgeIds: [],
					skillIds: [],
					dependencies: [],
				},
			],
			namespaces: new Map([
				['app', 'app'],
				['shared', 'shared'],
			]),
			buildContext: () => ({}) as never,
			importFn: async (specifier) => ({
				default: {
					name: specifier.includes('/app') ? 'app' : 'shared',
					dependsOn: specifier.includes('/app') ? ['shared'] : [],
					register: () => {
						if (specifier.includes('/shared')) {
							throw new Error('shared register failed');
						}
						return { tools: [] };
					},
				},
			}),
			onActivationError: ({ pluginId }) => failures.push(pluginId),
		});

		await expect(runtime.activatePlugin('app')).rejects.toThrow(
			'shared register failed',
		);
		expect(failures).toEqual(['shared', 'app']);
		expect(runtime.snapshot()).toEqual({
			loadedPluginIds: [],
			activatedToolIds: [],
		});
	});

	it('disposes activated plugins in reverse order and only once', async () => {
		const disposed: string[] = [];
		const runtime = createManagedLazyRuntime({
			namespacePrefix: 'mcp-vertex',
			plugins: [
				{
					id: 'app',
					packageSpecifier: '@delendai/app',
					toolIds: [],
					promptIds: [],
					resourceIds: [],
					knowledgeIds: [],
					skillIds: [],
					dependencies: ['shared'],
				},
				{
					id: 'shared',
					packageSpecifier: '@delendai/shared',
					toolIds: [],
					promptIds: [],
					resourceIds: [],
					knowledgeIds: [],
					skillIds: [],
					dependencies: [],
				},
			],
			namespaces: new Map([
				['app', 'app'],
				['shared', 'shared'],
			]),
			buildContext: () => ({}) as never,
			importFn: async (specifier) => ({
				default: {
					name: specifier.includes('/app') ? 'app' : 'shared',
					dependsOn: specifier.includes('/app') ? ['shared'] : [],
					register: () => ({
						registrations: { tools: [] },
						dispose: () => {
							disposed.push(specifier);
						},
					}),
				},
			}),
		});

		await runtime.activatePlugin('app');
		await runtime.disposePlugin('shared');
		await runtime.disposePlugin('shared');
		expect(await runtime.disposeAll()).toEqual([]);
		expect(disposed).toEqual(['@delendai/shared', '@delendai/app']);
		await runtime.disposeAll();
		expect(disposed).toEqual(['@delendai/shared', '@delendai/app']);
	});

	it('collects dispose failures and still disposes every activated plugin', async () => {
		const disposed: string[] = [];
		const runtime = createManagedLazyRuntime({
			namespacePrefix: 'mcp-vertex',
			plugins: [
				{
					id: 'first',
					packageSpecifier: '@delendai/first',
					toolIds: [],
					promptIds: [],
					resourceIds: [],
					knowledgeIds: [],
					skillIds: [],
					dependencies: [],
				},
				{
					id: 'second',
					packageSpecifier: '@delendai/second',
					toolIds: [],
					promptIds: [],
					resourceIds: [],
					knowledgeIds: [],
					skillIds: [],
					dependencies: [],
				},
			],
			namespaces: new Map([
				['first', 'first'],
				['second', 'second'],
			]),
			buildContext: () => ({}) as never,
			importFn: async (specifier) => ({
				default: {
					name: specifier.includes('/first') ? 'first' : 'second',
					register: () => ({
						registrations: { tools: [] },
						dispose: () => {
							disposed.push(specifier);
							if (specifier.includes('/second'))
								throw new Error('second dispose failed');
						},
					}),
				},
			}),
		});

		await runtime.activatePlugin('first');
		await runtime.activatePlugin('second');
		const errors = await runtime.disposeAll();
		expect(disposed).toEqual(['@delendai/second', '@delendai/first']);
		expect(errors).toEqual([
			{
				pluginId: 'second',
				error: expect.objectContaining({
					message: 'second dispose failed',
				}),
			},
		]);
	});
});

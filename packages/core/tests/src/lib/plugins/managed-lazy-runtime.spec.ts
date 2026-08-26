import z from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

import { describe, expect, it } from 'vitest';

import { createManagedLazyRuntime } from '@mcp-vertex/core/lib/plugins/managed-lazy-runtime';

describe('managed lazy plugin runtime', () => {
	it('imports once for concurrent first-use activation and captures the real schema', async () => {
		let imports = 0;
		const runtime = createManagedLazyRuntime({
			namespacePrefix: 'mcp-vertex',
			plugins: [
				{
					id: 'demo',
					packageSpecifier: '@mcp-vertex/demo',
					toolIds: ['echo'],
					promptIds: [],
					resourceIds: [],
					knowledgeIds: [],
					skillIds: [],
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
});

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { describe, expect, it } from 'vitest';
import z from 'zod';

import {
	createMetricsRegistry,
	estimateResultBytes,
	estimateResultCost,
} from '@mcp-vertex/core/lib/metrics/metrics-registry';
import { createMcpProject } from '@mcp-vertex/core/lib/project/create-mcp-project';
import { createWorkspacePathProvider } from '@mcp-vertex/core/lib/workspace/create-workspace-path-provider';
import type { IToolRegistration } from '@mcp-vertex/core/public';
import { toolError, toolOk } from '@mcp-vertex/core/public';

describe('metrics bytes and error accounting (x00223)', async () => {
	it('measures UTF-8 bytes for multibyte text correctly', async () => {
		const text = 'café 😀 日本語';
		expect(
			estimateResultBytes({
				content: [{ type: 'text', text }],
			}),
		).toBe(Buffer.byteLength(text, 'utf8'));
	});

	it('separates text, structured JSON and estimated token costs', async () => {
		const result = toolOk({
			message: 'hola 😀',
			language: '日本語',
		});
		const cost = estimateResultCost(result);
		expect(cost.contentTextBytes).toBe(
			Buffer.byteLength(result.content[0]?.text ?? '', 'utf8'),
		);
		expect(cost.structuredJsonBytes).toBe(
			Buffer.byteLength(JSON.stringify(result.structuredContent), 'utf8'),
		);
		expect(cost.wireEstimateBytes).toBe(
			cost.contentTextBytes + cost.structuredJsonBytes,
		);
		expect(cost.estimatedTokens.estimatedTokens4B).toBe(
			Math.ceil(cost.wireEstimateBytes / 4),
		);
		expect(cost.estimatedTokens.actualModelTokens).toBeUndefined();
	});

	it('counts error responses and does not leak private invocation data in aggregates', async () => {
		const privatePath = '/tmp/secret/customer-acme/roadmap.md';
		const privateQuery = 'find customer roadmap';
		const privateOutput = 'TOP SECRET OUTPUT';
		const registry = createMetricsRegistry();
		const errorTool: IToolRegistration = {
			id: 'failing',
			register: async (server) => {
				server.registerTool(
					'demo_failing',
					{
						description: 'fails safely',
						inputSchema: z.object({
							path: z.string(),
							query: z.string(),
						}),
						outputSchema: z.object({
							ok: z.literal(false),
							error: z.object({ reason: z.string() }),
						}),
					},
					async () => toolError('typed failure'),
				);
			},
		};
		const throwTool: IToolRegistration = {
			id: 'throwing',
			register: async (server) => {
				server.registerTool(
					'demo_throwing',
					{
						description: 'throws unsafely',
						inputSchema: z.object({ output: z.string() }),
						outputSchema: z.object({ ok: z.literal(true) }),
					},
					async () => {
						throw new Error(
							`failure at ${privatePath}?q=${privateQuery} -> ${privateOutput}`,
						);
					},
				);
			},
		};
		const assembled = await createMcpProject({
			metadata: { name: 'demo', version: '0.0.0', description: 'd' },
			workspace: createWorkspacePathProvider('/tmp'),
			metricsRegistry: registry,
			extraTools: [errorTool, throwTool],
		});
		const [clientTransport, serverTransport] =
			InMemoryTransport.createLinkedPair();
		await assembled.server.connect(serverTransport);
		const client = new Client(
			{ name: 't', version: '0' },
			{ capabilities: {} },
		);
		await client.connect(clientTransport);

		await client.callTool({
			name: 'demo_failing',
			arguments: { path: privatePath, query: privateQuery },
		});
		const thrownResult = await client.callTool({
			name: 'demo_throwing',
			arguments: { output: privateOutput },
		});
		expect(thrownResult.isError).toBe(true);

		const snapshot = registry.snapshot();
		expect(snapshot.tools.demo_failing?.errors).toBe(1);
		expect(snapshot.tools.demo_throwing?.errors).toBe(1);
		expect(snapshot.tools.demo_failing?.totalBytes).toBeGreaterThan(0);
		expect(snapshot.tools.demo_throwing?.totalBytes).toBeGreaterThan(0);
		const aggregateText = JSON.stringify(snapshot);
		expect(aggregateText).not.toContain(privatePath);
		expect(aggregateText).not.toContain(privateQuery);
		expect(aggregateText).not.toContain(privateOutput);

		await client.close();
		await assembled.server.close();
	});
});

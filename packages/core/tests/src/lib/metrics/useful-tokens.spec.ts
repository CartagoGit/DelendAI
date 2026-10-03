/**
 * useful-tokens.spec.ts — how much of the tool surface a session served
 * was ever used: bytes of the definitions tools/list served, and the part
 * belonging to tools invoked at least once.
 */
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import z from 'zod';
import { describe, expect, it } from 'vitest';

import { createMetricsRegistry } from '@delendai/core/lib/metrics/metrics-registry';
import { createMcpProject } from '@delendai/core/lib/project/create-mcp-project';
import { createWorkspacePathProvider } from '@delendai/core/lib/workspace/create-workspace-path-provider';
import type { IToolRegistration } from '@delendai/core/public';
import { toolOk } from '@delendai/core/public';

const call = (ms = 1) => ({ ms, bytes: 10, isError: false });

describe('useful tokens', () => {
	it('reports nothing served before a list, and no ratio', () => {
		expect(createMetricsRegistry().snapshot().surface).toEqual({
			listsServed: 0,
			servedBytes: 0,
			usefulBytes: 0,
		});
	});

	it('counts every list served and only the used tools as useful', () => {
		const registry = createMetricsRegistry();
		const list = [
			{ name: 'used', bytes: 300 },
			{ name: 'idle', bytes: 700 },
		];
		registry.recordToolListServed(list);
		registry.recordToolListServed(list);
		registry.record('used', call());
		// A tool reached through the router was never served: not counted.
		registry.record('hidden', call());
		expect(registry.snapshot().surface).toEqual({
			listsServed: 2,
			servedBytes: 2_000,
			usefulBytes: 600,
			usefulTokensRatio: 0.3,
		});
		registry.reset();
		expect(registry.snapshot().surface.listsServed).toBe(0);
	});

	it('measures a real session: the list a client saw, and the call it made', async () => {
		const registry = createMetricsRegistry();
		const tool = (name: string): IToolRegistration => ({
			id: name,
			register: async (server) => {
				server.registerTool(
					`demo_${name}`,
					{
						description: `${name} does one thing`,
						inputSchema: z.object({}),
						outputSchema: z.object({ ok: z.literal(true) }),
					},
					async () => toolOk(),
				);
			},
		});
		const assembled = await createMcpProject({
			metadata: { name: 'demo', version: '0.0.0', description: 'd' },
			workspace: createWorkspacePathProvider('/tmp'),
			metricsRegistry: registry,
			extraTools: [tool('used'), tool('idle')],
		});
		const [clientSide, serverSide] = InMemoryTransport.createLinkedPair();
		await assembled.server.connect(serverSide);
		const client = new Client(
			{ name: 't', version: '0' },
			{ capabilities: {} },
		);
		await client.connect(clientSide);
		try {
			await client.listTools();
			await client.callTool({ name: 'demo_used', arguments: {} });
			const surface = registry.snapshot().surface;
			expect(surface.listsServed).toBe(1);
			expect(surface.servedBytes).toBeGreaterThan(surface.usefulBytes);
			expect(surface.usefulBytes).toBeGreaterThan(0);
			expect(surface.usefulTokensRatio).toBeGreaterThan(0);
			expect(surface.usefulTokensRatio).toBeLessThan(1);
		} finally {
			await client.close();
			await assembled.server.close();
		}
	});
});

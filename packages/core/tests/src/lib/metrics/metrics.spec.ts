import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { z } from 'zod';
import { describe, expect, it } from 'vitest';

import {
	createMetricsRegistry,
	estimateResultBytes,
} from '@cartago-git/mcp-core/lib/metrics/metrics-registry';
import { createMcpServer } from '@cartago-git/mcp-core/lib/server/create-mcp-server';
import { createWorkspacePathProvider } from '@cartago-git/mcp-core/lib/workspace/create-workspace-path-provider';
import type { IToolRegistration } from '@cartago-git/mcp-core/public';
import { toolOk } from '@cartago-git/mcp-core/public';

describe('createMetricsRegistry (M12)', () => {
	it('aggregates calls, errors, latency and bytes per tool', () => {
		const r = createMetricsRegistry();
		r.record('a', { ms: 10, bytes: 100, isError: false });
		r.record('a', { ms: 30, bytes: 50, isError: true });
		r.record('b', { ms: 5, bytes: 7, isError: false });
		const snap = r.snapshot();
		expect(snap.tools.a).toEqual({
			calls: 2,
			errors: 1,
			totalMs: 40,
			maxMs: 30,
			totalBytes: 150,
		});
		expect(snap.tools.b?.calls).toBe(1);
		expect(snap.totals).toEqual({
			calls: 3,
			errors: 1,
			totalMs: 45,
			totalBytes: 157,
		});
	});

	it('reset zeroes the counters', () => {
		const r = createMetricsRegistry();
		r.record('a', { ms: 1, bytes: 1, isError: false });
		r.reset();
		expect(r.snapshot().totals.calls).toBe(0);
	});

	it('estimateResultBytes sums text content lengths', () => {
		expect(
			estimateResultBytes({ content: [{ type: 'text', text: 'hello' }, { type: 'text', text: 'hi' }] })
		).toBe(7);
		expect(estimateResultBytes({})).toBe(0);
		expect(estimateResultBytes({ content: 'nope' })).toBe(0);
	});
});

describe('tool metrics instrumentation over the protocol (M12)', () => {
	it('records a tool call assembled with a metricsRegistry', async () => {
		const registry = createMetricsRegistry();
		const pingTool: IToolRegistration = {
			id: 'ping',
			register: async (server) => {
				server.registerTool(
					'demo_ping',
					{
						description: 'ping',
						inputSchema: z.object({}),
						outputSchema: z.object({ ok: z.literal(true), pong: z.string() }),
					},
					async () => toolOk({ pong: 'hi there' })
				);
			},
		};
		const assembled = await createMcpServer({
			metadata: { name: 'demo', version: '0.0.0', description: 'd' },
			workspace: createWorkspacePathProvider('/tmp'),
			metricsRegistry: registry,
			extraTools: [pingTool],
		});
		const [ct, st] = InMemoryTransport.createLinkedPair();
		await assembled.server.connect(st);
		const client = new Client({ name: 't', version: '0' }, { capabilities: {} });
		await client.connect(ct);

		await client.callTool({ name: 'demo_ping', arguments: {} });
		await client.callTool({ name: 'demo_ping', arguments: {} });

		const snap = registry.snapshot();
		expect(snap.tools.demo_ping?.calls).toBe(2);
		expect(snap.tools.demo_ping?.errors).toBe(0);
		expect(snap.tools.demo_ping?.totalBytes).toBeGreaterThan(0);
		expect(snap.totals.calls).toBe(2);

		await client.close();
		await assembled.server.close();
	});
});

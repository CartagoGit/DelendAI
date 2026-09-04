import { mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import z from 'zod';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
	createMetricsRegistry,
	estimateResponseBytes,
	estimateResultBytes,
	estimateResultCost,
} from '@delendai/core/lib/metrics/metrics-registry';
import { buildMetricsToolRegistration } from '@delendai/core/lib/metrics/metrics-tool';
import { createMcpProject } from '@delendai/core/lib/project/create-mcp-project';
import { createWorkspacePathProvider } from '@delendai/core/lib/workspace/create-workspace-path-provider';
import type { IToolRegistration } from '@delendai/core/public';
import { toolOk } from '@delendai/core/public';

describe('createMetricsRegistry (M12)', async () => {
	it('aggregates calls, errors, latency and bytes per tool', async () => {
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
			cost: {
				contentTextBytes: 150,
				structuredJsonBytes: 0,
				wireEstimateBytes: 150,
				estimatedTokens: {
					estimatedTokens4B: 38,
				},
			},
		});
		expect(snap.tools.b?.calls).toBe(1);
		expect(snap.totals).toEqual({
			calls: 3,
			errors: 1,
			totalMs: 45,
			totalBytes: 157,
			cost: {
				contentTextBytes: 157,
				structuredJsonBytes: 0,
				wireEstimateBytes: 157,
				estimatedTokens: {
					estimatedTokens4B: 40,
				},
			},
		});
	});

	it('reset zeroes the counters', async () => {
		const r = createMetricsRegistry();
		r.record('a', { ms: 1, bytes: 1, isError: false });
		r.reset();
		expect(r.snapshot().totals.calls).toBe(0);
	});

	it('estimateResultBytes sums text content lengths', async () => {
		expect(
			estimateResultBytes({
				content: [
					{ type: 'text', text: 'hello' },
					{ type: 'text', text: 'hi' },
				],
			}),
		).toBe(7);
		expect(estimateResultBytes({})).toBe(0);
		expect(estimateResultBytes({ content: 'nope' })).toBe(0);
	});

	it('keeps responseBytes separate from structured-only wire cost', async () => {
		const result = {
			structuredContent: {
				message: 'hola 😀',
				language: '日本語',
			},
		};
		const cost = estimateResultCost(result);

		expect(estimateResponseBytes(result)).toBe(0);
		expect(estimateResultBytes(result)).toBe(0);
		expect(cost.structuredJsonBytes).toBeGreaterThan(0);
		expect(cost.wireEstimateBytes).toBe(cost.structuredJsonBytes);
	});
});

describe('metrics tool — persist snapshots (M29)', async () => {
	let dir = '';
	const capture = async (persistDir?: string) => {
		const registry = createMetricsRegistry();
		registry.record('demo_ping', { ms: 5, bytes: 10, isError: false });
		const reg = buildMetricsToolRegistration(
			'mcp-vertex',
			registry,
			persistDir,
		);
		let handler: (
			a: unknown,
		) => Promise<{ structuredContent?: Record<string, unknown> }>;
		await reg.register({
			registerTool: (_n: string, _d: unknown, fn: typeof handler) => {
				handler = fn;
			},
		} as never);
		return handler!;
	};
	beforeEach(() => {
		dir = mkdtempSync(join(tmpdir(), 'metrics-'));
	});
	afterEach(() => rmSync(dir, { recursive: true, force: true }));

	it('writes a timestamped snapshot when persist:true', async () => {
		const metricsDir = join(dir, 'metrics');
		const handler = await capture(metricsDir);
		const res = await handler({ persist: true });
		expect(res.structuredContent?.persistedTo).toBeDefined();
		expect(res.structuredContent?.snapshots).toBe(1);
		const files = readdirSync(metricsDir).filter((f) =>
			f.endsWith('.json'),
		);
		expect(files).toHaveLength(1);
		const saved = JSON.parse(
			readFileSync(join(metricsDir, files[0]!), 'utf8'),
		);
		expect(saved.at).toBeDefined();
		expect(saved.tools.demo_ping.calls).toBe(1);
	});

	it('does not write when persist is absent', async () => {
		const metricsDir = join(dir, 'metrics');
		const handler = await capture(metricsDir);
		const res = await handler({});
		expect(res.structuredContent?.persistedTo).toBeUndefined();
		expect(() => readdirSync(metricsDir)).toThrow();
	});

	it('is a no-op persist when no dir is configured', async () => {
		const handler = await capture(undefined);
		const res = await handler({ persist: true });
		expect(res.structuredContent?.persistedTo).toBeUndefined();
		expect(res.structuredContent?.tools).toBeDefined();
	});

	it('reset:true returns the pre-reset snapshot but zeroes the registry for the next read', async () => {
		const registry = createMetricsRegistry();
		registry.record('demo_ping', { ms: 5, bytes: 10, isError: false });
		const reg = buildMetricsToolRegistration('mcp-vertex', registry);
		let handler: (
			a: unknown,
		) => Promise<{ structuredContent?: Record<string, unknown> }>;
		await reg.register({
			registerTool: (_n: string, _d: unknown, fn: typeof handler) => {
				handler = fn;
			},
		} as never);

		const res = await handler!({ reset: true });

		// The caller that asked for the reset still sees the data it reset.
		const tools = res.structuredContent?.tools as
			| Record<string, { calls: number }>
			| undefined;
		expect(tools?.demo_ping?.calls).toBe(1);
		// But the registry itself is now empty for whoever reads it next.
		expect(registry.snapshot().tools).toEqual({});
	});
});

describe('tool metrics instrumentation over the protocol (M12)', async () => {
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
						outputSchema: z.object({
							ok: z.literal(true),
							pong: z.string(),
						}),
					},
					async () => toolOk({ pong: 'hi there' }),
				);
			},
		};
		const assembled = await createMcpProject({
			metadata: { name: 'demo', version: '0.0.0', description: 'd' },
			workspace: createWorkspacePathProvider('/tmp'),
			metricsRegistry: registry,
			extraTools: [pingTool],
		});
		const [ct, st] = InMemoryTransport.createLinkedPair();
		await assembled.server.connect(st);
		const client = new Client(
			{ name: 't', version: '0' },
			{ capabilities: {} },
		);
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

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { describe, expect, it } from 'vitest';
import z from 'zod';

import {
	createMetricsRegistry,
	estimateErrorCost,
	estimateResponseBytes,
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

	it('preserves responseBytes as text-only while charging structured multibyte JSON in cost', async () => {
		const result = toolOk({
			message: 'hola 😀',
			language: '日本語',
		});
		const expectedStructuredBytes = Buffer.byteLength(
			JSON.stringify(result.structuredContent),
			'utf8',
		);

		expect(estimateResponseBytes(result)).toBe(
			Buffer.byteLength(result.content[0]?.text ?? '', 'utf8'),
		);
		expect(estimateResultBytes(result)).toBe(estimateResponseBytes(result));
		expect(estimateResultCost(result)).toMatchObject({
			contentTextBytes: estimateResponseBytes(result),
			structuredJsonBytes: expectedStructuredBytes,
			wireEstimateBytes:
				estimateResponseBytes(result) + expectedStructuredBytes,
		});
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

	it('does not let structured-only multibyte results collapse to zero wire cost', async () => {
		const result = {
			structuredContent: {
				message: 'hola 😀',
				language: '日本語',
			},
		};
		const cost = estimateResultCost(result);

		expect(estimateResponseBytes(result)).toBe(0);
		expect(cost.contentTextBytes).toBe(0);
		expect(cost.structuredJsonBytes).toBe(
			Buffer.byteLength(JSON.stringify(result.structuredContent), 'utf8'),
		);
		expect(cost.wireEstimateBytes).toBeGreaterThan(0);
		expect(cost.estimatedTokens.estimatedTokens4B).toBe(
			Math.ceil(cost.wireEstimateBytes / 4),
		);
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

describe('estimateErrorCost — typed-error-text extraction (x00223)', () => {
	// estimateErrorCost only inspects `error` when the result carried zero
	// bytes of its own; an empty envelope forces every case below down
	// the extraction path instead of short-circuiting on `resultCost`.
	const EMPTY_RESULT = { content: [] };
	const FALLBACK_BYTES = Buffer.byteLength('error', 'utf8');

	it('uses a safe string error verbatim', () => {
		const cost = estimateErrorCost(EMPTY_RESULT, 'not a git repository');
		expect(cost.contentTextBytes).toBe(
			Buffer.byteLength('not a git repository', 'utf8'),
		);
	});

	it('falls back to the generic marker for an unsafe string error (contains a path separator)', () => {
		const cost = estimateErrorCost(EMPTY_RESULT, '/etc/passwd leaked');
		expect(cost.contentTextBytes).toBe(FALLBACK_BYTES);
	});

	it('falls back to the generic marker for a string containing query-like characters', () => {
		const cost = estimateErrorCost(EMPTY_RESULT, 'lookup?id=42&mode=x');
		expect(cost.contentTextBytes).toBe(FALLBACK_BYTES);
	});

	it('falls back to the generic marker for a string containing a drive-letter-shaped path', () => {
		const cost = estimateErrorCost(EMPTY_RESULT, 'failed at C:oops');
		expect(cost.contentTextBytes).toBe(FALLBACK_BYTES);
	});

	it('falls back to the generic marker when error is null', () => {
		const cost = estimateErrorCost(EMPTY_RESULT, null);
		expect(cost.contentTextBytes).toBe(FALLBACK_BYTES);
	});

	it('falls back to the generic marker when error is a non-object primitive', () => {
		const cost = estimateErrorCost(EMPTY_RESULT, 42);
		expect(cost.contentTextBytes).toBe(FALLBACK_BYTES);
	});

	it('extracts a safe `.reason` field from an error-shaped object', () => {
		const cost = estimateErrorCost(EMPTY_RESULT, {
			reason: 'refused: protected branch',
		});
		expect(cost.contentTextBytes).toBe(
			Buffer.byteLength('refused: protected branch', 'utf8'),
		);
	});

	it('falls back to `.message` when `.reason` is unsafe, proving the key order is reason-then-message', () => {
		const cost = estimateErrorCost(EMPTY_RESULT, {
			reason: '/private/path/leaked',
			message: 'a safe message',
		});
		expect(cost.contentTextBytes).toBe(
			Buffer.byteLength('a safe message', 'utf8'),
		);
	});

	it('falls back to the generic marker when neither `.reason` nor `.message` is safe', () => {
		const cost = estimateErrorCost(EMPTY_RESULT, {
			reason: '/private/path',
			message: 'also /private',
		});
		expect(cost.contentTextBytes).toBe(FALLBACK_BYTES);
	});

	it('prefers the result-derived cost over the error text when the result itself carried bytes', () => {
		const result = toolOk({ ok: true });
		const cost = estimateErrorCost(result, 'irrelevant, never read');
		expect(cost.wireEstimateBytes).toBeGreaterThan(0);
		expect(cost).toEqual(estimateResultCost(result));
	});
});

describe('createMetricsRegistry — actualModelTokens accumulation', () => {
	// f00027's historical defect (see payload-percentile.ts) was a
	// null-vs-number disagreement between a metrics producer and its
	// schema. This registry's own actualModelTokens field carries the
	// same risk — the schema (metrics-tool.ts `ToolCostSchema`) declares
	// it `.optional()`, which accepts an absent key but rejects an
	// explicit `null`. These tests hold the registry to that contract.
	it('omits actualModelTokens entirely (not null) when no call ever reported one', () => {
		const registry = createMetricsRegistry();
		registry.record('demo', { ms: 1, bytes: 1, isError: false });

		const snapshot = registry.snapshot();

		expect(snapshot.tools.demo?.cost.estimatedTokens).not.toHaveProperty(
			'actualModelTokens',
		);
		expect(snapshot.totals.cost.estimatedTokens).not.toHaveProperty(
			'actualModelTokens',
		);
	});

	it('sums actualModelTokens across multiple calls for the same tool and into the totals', () => {
		const registry = createMetricsRegistry();
		registry.record('demo', {
			ms: 1,
			bytes: 1,
			isError: false,
			cost: {
				contentTextBytes: 1,
				structuredJsonBytes: 0,
				wireEstimateBytes: 1,
				estimatedTokens: {
					estimatedTokens4B: 1,
					actualModelTokens: 10,
				},
			},
		});
		registry.record('demo', {
			ms: 1,
			bytes: 1,
			isError: false,
			cost: {
				contentTextBytes: 1,
				structuredJsonBytes: 0,
				wireEstimateBytes: 1,
				estimatedTokens: { estimatedTokens4B: 1, actualModelTokens: 5 },
			},
		});

		const snapshot = registry.snapshot();

		expect(
			snapshot.tools.demo?.cost.estimatedTokens.actualModelTokens,
		).toBe(15);
		expect(snapshot.totals.cost.estimatedTokens.actualModelTokens).toBe(15);
	});

	it('does not let one tool with no actualModelTokens zero out another tool that reported one, in the totals', () => {
		const registry = createMetricsRegistry();
		registry.record('with-tokens', {
			ms: 1,
			bytes: 1,
			isError: false,
			cost: {
				contentTextBytes: 1,
				structuredJsonBytes: 0,
				wireEstimateBytes: 1,
				estimatedTokens: { estimatedTokens4B: 1, actualModelTokens: 7 },
			},
		});
		registry.record('without-tokens', { ms: 1, bytes: 1, isError: false });

		const totals = registry.snapshot().totals;

		expect(totals.cost.estimatedTokens.actualModelTokens).toBe(7);
	});
});

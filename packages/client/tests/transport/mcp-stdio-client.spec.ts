import { describe, expect, it } from 'vitest';

import {
	McpStdioClient,
	McpToolError,
	payloadFromResult,
	type IMcpTransport,
} from '../../src/public/index';

describe('McpStdioClient', async () => {
	it('calls a tool through the injected transport and returns structured content', async () => {
		const calls: Array<{
			name: string;
			arguments?: object;
		}> = [];
		const client = McpStdioClient.fromTransport({
			async callTool(input) {
				calls.push(input);
				return {
					structuredContent: {
						ok: true,
						tool: input.name,
						args: input.arguments,
					},
				};
			},
		});

		const out = await client.request<
			{ compact: boolean },
			{ ok: boolean; tool: string; args: { compact: boolean } }
		>('mcp-vertex_overview', { compact: true });

		expect(out).toEqual({
			ok: true,
			tool: 'mcp-vertex_overview',
			args: { compact: true },
		});
		expect(calls).toEqual([
			{
				name: 'mcp-vertex_overview',
				arguments: { compact: true },
			},
		]);
	});

	it('falls back to JSON text payloads when structured content is absent', async () => {
		const client = McpStdioClient.fromTransport({
			async callTool() {
				return {
					content: [{ type: 'text', text: '{"count":2}' }],
				};
			},
		});

		await expect(
			client.request<Record<string, never>, { count: number }>(
				'demo_count',
				{},
			),
		).resolves.toEqual({ count: 2 });
	});

	it('throws a typed error for MCP error results', async () => {
		const result = {
			isError: true,
			content: [{ type: 'text', text: '{"error":"boom"}' }],
		};
		const client = McpStdioClient.fromTransport({
			async callTool() {
				return result;
			},
		});

		await expect(client.request('demo_fail', {})).rejects.toMatchObject({
			name: 'McpToolError',
			result,
		});
	});

	it('attaches a logHint from structuredContent on an error result', async () => {
		const logHint = {
			path: '/tmp/x/.cache/mcp-vertex/logs/2026-06-22.jsonl',
			line: 7,
			ts: '2026-06-22T10:00:00.000Z',
		};
		const client = McpStdioClient.fromTransport({
			async callTool() {
				return {
					isError: true,
					structuredContent: {
						ok: false,
						error: { reason: 'x' },
						logHint,
					},
					content: [{ type: 'text', text: '{"ok":false}' }],
				};
			},
		});
		await expect(client.request('demo_fail', {})).rejects.toMatchObject({
			name: 'McpToolError',
			logHint,
		});
	});

	it('attaches a logHint parsed from the text envelope when structuredContent is absent', async () => {
		const logHint = {
			path: '/tmp/y/.cache/mcp-vertex/logs/2026-06-22.jsonl',
			line: 3,
			ts: '2026-06-22T11:00:00.000Z',
		};
		const client = McpStdioClient.fromTransport({
			async callTool() {
				return {
					isError: true,
					content: [
						{
							type: 'text',
							text: JSON.stringify({
								ok: false,
								error: { reason: 'x' },
								logHint,
							}),
						},
					],
				};
			},
		});
		await expect(client.request('demo_fail', {})).rejects.toMatchObject({
			name: 'McpToolError',
			logHint,
		});
	});

	it('leaves logHint undefined on an error result without one', async () => {
		const client = McpStdioClient.fromTransport({
			async callTool() {
				return {
					isError: true,
					content: [{ type: 'text', text: '{"ok":false}' }],
				};
			},
		});
		const err = await client.request('demo_fail', {}).catch((e) => e);
		expect(err).toBeInstanceOf(McpToolError);
		expect((err as McpToolError).logHint).toBeUndefined();
	});

	it('ignores a malformed logHint (missing/!typed fields)', async () => {
		const client = McpStdioClient.fromTransport({
			async callTool() {
				return {
					isError: true,
					structuredContent: {
						ok: false,
						logHint: { path: '/x', line: 'NaN', ts: 1 },
					},
					content: [{ type: 'text', text: '{"ok":false}' }],
				};
			},
		});
		const err = await client.request('demo_fail', {}).catch((e) => e);
		expect((err as McpToolError).logHint).toBeUndefined();
	});

	it('lists tools and closes the underlying transport when supported', async () => {
		let closed = false;
		const transport: IMcpTransport = {
			async callTool() {
				return { structuredContent: {} };
			},
			async listTools() {
				return {
					tools: [
						{
							name: 'mcp-vertex_overview',
							description: 'Overview',
						},
					],
				};
			},
			async close() {
				closed = true;
			},
		};
		const client = McpStdioClient.fromTransport(transport);

		await expect(client.listTools()).resolves.toEqual([
			{
				name: 'mcp-vertex_overview',
				description: 'Overview',
			},
		]);
		await client.close();
		expect(closed).toBe(true);
	});
});

describe('payloadFromResult', async () => {
	it('returns plain text when the text payload is not JSON', async () => {
		expect(
			payloadFromResult<string>({ content: [{ text: 'plain' }] }),
		).toBe('plain');
	});

	it('throws when the result contains no usable payload', async () => {
		expect(() => payloadFromResult({ content: [] })).toThrow(McpToolError);
	});
});

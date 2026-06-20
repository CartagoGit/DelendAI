import { describe, expect, it } from 'vitest';

import {
	McpStdioClient,
	McpToolError,
	payloadFromResult,
	type IMcpTransport,
} from '../../src/public/index';

describe('McpStdioClient', () => {
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

describe('payloadFromResult', () => {
	it('returns plain text when the text payload is not JSON', () => {
		expect(
			payloadFromResult<string>({ content: [{ text: 'plain' }] }),
		).toBe('plain');
	});

	it('throws when the result contains no usable payload', () => {
		expect(() => payloadFromResult({ content: [] })).toThrow(McpToolError);
	});
});

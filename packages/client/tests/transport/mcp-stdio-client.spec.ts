import z from 'zod';
import { describe, expect, it } from 'vitest';

import {
	McpStdioClient,
	McpToolError,
	payloadFromResult,
	type IMcpTransportError,
	type IMcpTransport,
} from '../../src/public/index';

describe('McpStdioClient', async () => {
	it('serializes concurrent protocol requests on one transport', async () => {
		let activeCalls = 0;
		let maximumActiveCalls = 0;
		let releaseFirstCall: (() => void) | undefined;
		const firstCallReleased = new Promise<void>((resolve) => {
			releaseFirstCall = resolve;
		});

		const client = McpStdioClient.fromTransport({
			async callTool(input) {
				activeCalls += 1;
				maximumActiveCalls = Math.max(maximumActiveCalls, activeCalls);
				if (input.name === 'first') await firstCallReleased;
				activeCalls -= 1;
				return { structuredContent: { tool: input.name } };
			},
		});

		const first = client.request<{ value: 1 }, { tool: string }>('first', {
			value: 1,
		});
		const second = client.request<{ value: 2 }, { tool: string }>(
			'second',
			{
				value: 2,
			},
		);

		await Promise.resolve();
		expect(maximumActiveCalls).toBe(1);
		releaseFirstCall?.();

		await expect(first).resolves.toEqual({ tool: 'first' });
		await expect(second).resolves.toEqual({ tool: 'second' });
		expect(maximumActiveCalls).toBe(1);
	});

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
		>('delendai_overview', { compact: true });

		expect(out).toEqual({
			ok: true,
			tool: 'delendai_overview',
			args: { compact: true },
		});
		expect(calls).toEqual([
			{
				name: 'delendai_overview',
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

	it('validates the payload when an output schema is provided', async () => {
		const client = McpStdioClient.fromTransport({
			async callTool() {
				return {
					structuredContent: {
						count: 2,
					},
				};
			},
		});

		await expect(
			client.request(
				'demo_count',
				{},
				z.object({ count: z.number().int().positive() }),
			),
		).resolves.toEqual({ count: 2 });
	});

	it('throws an invalid-payload transport error when schema validation fails', async () => {
		const client = McpStdioClient.fromTransport({
			async callTool() {
				return {
					structuredContent: {
						count: '2',
					},
				};
			},
		});

		await expect(
			client.request('demo_count', {}, z.object({ count: z.number() })),
		).rejects.toMatchObject({
			code: 'mcp-invalid-payload',
			kind: 'invalid-payload',
		} satisfies Partial<IMcpTransportError>);
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
			code: 'mcp-tool-error',
			kind: 'tool-error',
			result,
		});
	});

	it.each([
		{
			code: 'mcp-timeout',
			error: new Error('request timed out after 5s'),
			kind: 'timeout',
			label: 'timeout errors',
		},
		{
			code: 'mcp-cancellation',
			error: Object.assign(new Error('operation aborted'), {
				name: 'AbortError',
			}),
			kind: 'cancellation',
			label: 'cancellation errors',
		},
		{
			code: 'mcp-protocol',
			error: new Error('JSON-RPC protocol error: invalid response'),
			kind: 'protocol',
			label: 'protocol errors',
		},
		{
			code: 'mcp-server-exit',
			error: new Error('Server exited before responding with code 1'),
			kind: 'server-exit',
			label: 'server-exit errors',
		},
	] as const)('classifies $label', async ({ code, error, kind }) => {
		const client = McpStdioClient.fromTransport({
			async callTool() {
				throw error;
			},
		});

		await expect(client.request('demo_fail', {})).rejects.toMatchObject({
			code,
			kind,
		} satisfies Partial<IMcpTransportError>);
	});

	it('describes a plain Error without a redundant "Error" prefix', async () => {
		const client = McpStdioClient.fromTransport({
			async callTool() {
				throw new Error('server offline');
			},
		});

		await expect(client.request('demo_fail', {})).rejects.toMatchObject({
			message: 'Failed to call MCP tool "demo_fail": server offline',
		} satisfies Partial<Error>);
	});

	it('keeps a distinctive Error subclass name when describing the failure', async () => {
		const client = McpStdioClient.fromTransport({
			async callTool() {
				throw Object.assign(new Error('bad input'), {
					name: 'ValidationError',
				});
			},
		});

		await expect(client.request('demo_fail', {})).rejects.toMatchObject({
			message:
				'Failed to call MCP tool "demo_fail": ValidationError: bad input',
		} satisfies Partial<Error>);
	});

	it('attaches a logHint from structuredContent on an error result', async () => {
		const logHint = {
			path: '/tmp/x/.cache/delendai/logs/2026-06-22.jsonl',
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

	it('attaches a logHint from the MCP _meta channel on an error result', async () => {
		const logHint = {
			path: '/tmp/z/.cache/delendai/logs/2026-06-22.jsonl',
			line: 9,
			ts: '2026-06-22T12:00:00.000Z',
		};
		const client = McpStdioClient.fromTransport({
			async callTool() {
				return {
					isError: true,
					_meta: { logHint },
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
			path: '/tmp/y/.cache/delendai/logs/2026-06-22.jsonl',
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
							name: 'delendai_overview',
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
				name: 'delendai_overview',
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
		expect(() => payloadFromResult({ content: [] })).toThrow(
			'MCP tool returned no structured or text payload',
		);
	});
});

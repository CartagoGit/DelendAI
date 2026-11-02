/**
 * Reaching a tool the managed surface keeps hidden, as every client does.
 */
import { describe, expect, it } from 'vitest';

import { McpStdioClient, type IMcpTransport } from '../../src/public/index';
import {
	isUnexposedHere,
	prefixOfSurface,
	requalify,
	unwrapResolved,
} from '../../src/lib/transport/tool-reach.helper';

const refused = (tool: string, word = 'not found') => ({
	content: [{ type: 'text', text: `MCP error -32602: Tool ${tool} ${word}` }],
	isError: true,
});

const resolved = (payload: unknown) => ({
	structuredContent: {
		status: 'ok',
		result: { content: [{ type: 'text', text: JSON.stringify(payload) }] },
	},
});

/** A server with one hidden tool, recording every call it receives. */
const surface = (
	tools: readonly string[] = ['acme_resolve_capability'],
): { readonly calls: string[]; readonly transport: IMcpTransport } => {
	const calls: string[] = [];
	return {
		calls,
		transport: {
			callTool: async ({ name }) => {
				calls.push(name);
				return name.endsWith('_resolve_capability')
					? resolved({ answer: 1 })
					: refused(name);
			},
			listTools: async () => ({
				tools: tools.map((name) => ({ name })),
			}),
		},
	};
};

describe('a hidden tool', () => {
	it('is reached through the resolver the server names', async () => {
		const { transport, calls } = surface();
		const client = McpStdioClient.fromTransport(transport);
		await expect(
			client.request('delendai_proposals_board', {}),
		).resolves.toEqual({ answer: 1 });
		expect(calls).toEqual([
			'delendai_proposals_board',
			'acme_resolve_capability',
		]);
	});

	it('is not asked directly a second time', async () => {
		const { transport, calls } = surface();
		const client = McpStdioClient.fromTransport(transport);
		await client.request('delendai_metrics', {});
		await client.request('delendai_metrics', {});
		expect(
			calls.filter((name) => name === 'delendai_metrics'),
		).toHaveLength(1);
	});

	it('states the refusal when the surface names no resolver', async () => {
		const { transport } = surface([]);
		const client = McpStdioClient.fromTransport(transport);
		await expect(client.request('delendai_x', {})).rejects.toThrow(
			'not found',
		);
	});
});

describe('tool reach helpers', () => {
	it('tells a hidden tool from a bad argument', () => {
		expect(isUnexposedHere(refused('t'))).toBe(true);
		expect(isUnexposedHere(refused('t', 'disabled'))).toBe(true);
		expect(
			isUnexposedHere(refused('t', 'not found: unknown argument')),
		).toBe(false);
		expect(isUnexposedHere({ content: [] })).toBe(false);
	});

	it('reads the namespace off the surface', () => {
		expect(prefixOfSurface(['a_b', 'acme_resolve_capability'])).toBe(
			'acme',
		);
		expect(prefixOfSurface(['a_b'])).toBeUndefined();
	});

	it('spells a logical name in the server namespace', () => {
		expect(requalify('delendai_git_status', 'acme')).toBe(
			'acme_git_status',
		);
		expect(requalify('status', 'acme')).toBe('acme_status');
	});

	it('unwraps JSON, keeps prose and states a refusal', () => {
		const text = (value: string) => ({
			status: 'ok',
			result: { content: [{ text: value }] },
		});
		expect(unwrapResolved('t', text('{"a":1}'))).toEqual({ a: 1 });
		expect(
			unwrapResolved('t', {
				status: 'ok',
				result: {
					content: [{ text: '3 tools' }],
					structuredContent: { tools: [] },
				},
			}),
		).toEqual({ tools: [] });
		expect(unwrapResolved('t', text('prose'))).toBe('prose');
		expect(() => unwrapResolved('t', { status: 'ok' })).toThrow(
			'no payload',
		);
		expect(() =>
			unwrapResolved('t', {
				status: 'terminal',
				reason: 'policy_denied',
			}),
		).toThrow('policy_denied');
	});
});

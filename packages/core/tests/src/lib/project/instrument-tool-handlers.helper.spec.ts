/**
 * instrument-tool-handlers.helper.spec.ts — the tool-result boundary on a
 * real MCP server and client.
 *
 * A client that lists tools learns every output schema and then validates
 * `structuredContent` even on error results. These cases pin that an
 * error still reaches such a client with its reason, that hooks keep the
 * handler's own result, and that a failing hook never breaks the call.
 */

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { describe, expect, it } from 'vitest';
import z from 'zod';

import type { IDelendaiHostConfig } from '@delendai/core/lib/contracts/interfaces/host-config.interface';
import { instrumentToolHandlers } from '@delendai/core/lib/project/instrument-tool-handlers.helper';
import { toolError, toolOk } from '@delendai/core/lib/shared/tool-response';
import { createWorkspacePathProvider } from '@delendai/core/lib/workspace/create-workspace-path-provider';

const SUCCESS_SCHEMA = z.object({ ok: z.literal(true), value: z.string() });

const baseConfig = (
	hooks: Partial<IDelendaiHostConfig>,
): IDelendaiHostConfig => ({
	metadata: {
		name: 'instrument-spec',
		version: '0.0.0',
		description: 'instrument tool handlers spec host',
	},
	namespacePrefix: 'spec',
	workspace: createWorkspacePathProvider(
		'/tmp/spec-instrument-tool-handlers',
	),
	corePaths: { cacheDir: '.cache/delendai', docsDir: 'docs/delendai' },
	validationMatrix: { scopes: {} },
	...hooks,
});

const serve = async (
	config: IDelendaiHostConfig,
	handler: () => ReturnType<typeof toolOk> | ReturnType<typeof toolError>,
) => {
	const server = new McpServer({ name: 'instrument-spec', version: '0.0.0' });
	instrumentToolHandlers(server, config);
	server.registerTool(
		'spec_tool',
		{
			description: 'spec tool',
			inputSchema: z.object({}),
			outputSchema: SUCCESS_SCHEMA,
		},
		async () => handler(),
	);
	const [clientTransport, serverTransport] =
		InMemoryTransport.createLinkedPair();
	await server.connect(serverTransport);
	const client = new Client({ name: 'instrument-client', version: '0' });
	await client.connect(clientTransport);
	return {
		client,
		close: async () => {
			await client.close();
			await server.close();
		},
	};
};

const firstText = (result: object): string => {
	const content = (
		result as {
			readonly content?: ReadonlyArray<{ readonly text?: string }>;
		}
	).content;
	return content?.[0]?.text ?? '';
};

describe('instrumentToolHandlers over the protocol', () => {
	it('delivers an error to a client that listed tools, without structured content its schema rejects', async () => {
		const seenByHooks: unknown[] = [];
		const { client, close } = await serve(
			baseConfig({
				onToolCall: (_name, _args, result) => {
					seenByHooks.push(result);
				},
			}),
			() => toolError('bad input', 'pass a value'),
		);
		try {
			await client.listTools();

			const result = await client.callTool({
				name: 'spec_tool',
				arguments: {},
			});

			expect(result.isError).toBe(true);
			expect(result.structuredContent).toBeUndefined();
			expect(JSON.parse(firstText(result))).toEqual({
				ok: false,
				error: { reason: 'bad input', nextAction: 'pass a value' },
			});
			expect(seenByHooks[0]).toMatchObject({
				structuredContent: {
					ok: false,
					error: { reason: 'bad input' },
				},
			});
		} finally {
			await close();
		}
	});

	it('keeps structured content on a successful result', async () => {
		const { client, close } = await serve(baseConfig({}), () =>
			toolOk({ value: 'pong' }),
		);
		try {
			await client.listTools();

			const result = await client.callTool({
				name: 'spec_tool',
				arguments: {},
			});

			expect(result.isError).toBeFalsy();
			expect(result.structuredContent).toEqual({
				ok: true,
				value: 'pong',
			});
		} finally {
			await close();
		}
	});

	it('answers normally when lifecycle hooks and the hook-error sink reject', async () => {
		const reported: string[] = [];
		const { client, close } = await serve(
			baseConfig({
				onToolStart: async () => {
					throw new Error('start hook failed');
				},
				onToolCall: async () => {
					throw new Error('call hook failed');
				},
				onHookError: async (info) => {
					reported.push(info.hookName);
					throw new Error('hook error sink failed');
				},
			}),
			() => toolOk({ value: 'pong' }),
		);
		try {
			const result = await client.callTool({
				name: 'spec_tool',
				arguments: {},
			});
			await new Promise((resolve) => setTimeout(resolve, 0));

			expect(result.structuredContent).toEqual({
				ok: true,
				value: 'pong',
			});
			expect(reported.sort()).toEqual(['onToolCall', 'onToolStart']);
		} finally {
			await close();
		}
	});
});

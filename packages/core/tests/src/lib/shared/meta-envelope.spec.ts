import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { describe, expect, it } from 'vitest';
import z from 'zod';

import type { IDelendaiHostConfig } from '@delendai/core/lib/contracts/interfaces/host-config.interface';
import type { IToolRegistration } from '@delendai/core/lib/contracts/interfaces/tool-registration.interface';
import { createMcpProject } from '@delendai/core/lib/project/create-mcp-project';
import { toolError, toolOk } from '@delendai/core/lib/shared/tool-response';
import { createWorkspacePathProvider } from '@delendai/core/lib/workspace/create-workspace-path-provider';

const SUCCESS_SCHEMA = z.object({
	ok: z.literal(true),
	value: z.string(),
});

const ERROR_SCHEMA = z.object({
	ok: z.literal(false),
	error: z.object({
		reason: z.string(),
		nextAction: z.string().optional(),
	}),
});

const hostConfig = (
	extraTools: readonly IToolRegistration[],
	extra?: Partial<IDelendaiHostConfig>,
): IDelendaiHostConfig => ({
	metadata: {
		name: 'meta-envelope-spec',
		version: '0.0.0',
		description: 'meta envelope spec host',
	},
	namespacePrefix: 'spec',
	workspace: createWorkspacePathProvider('/tmp/spec-meta-envelope'),
	corePaths: {
		cacheDir: '.cache/delendai',
		docsDir: 'docs/delendai',
	},
	validationMatrix: { scopes: {} },
	extraTools,
	...extra,
});

const registerTool = (
	id: string,
	outputSchema: z.ZodType,
	handler: () => ReturnType<typeof toolOk> | ReturnType<typeof toolError>,
): IToolRegistration => ({
	id,
	register: async (server) => {
		server.registerTool(
			`spec_${id}`,
			{
				description: id,
				inputSchema: z.object({}),
				outputSchema,
			},
			async () => handler(),
		);
	},
});

const connect = async (config: IDelendaiHostConfig) => {
	const assembled = await createMcpProject(config);
	const [clientTransport, serverTransport] =
		InMemoryTransport.createLinkedPair();
	await assembled.server.connect(serverTransport);
	const client = new Client(
		{ name: 'meta-envelope-client', version: '0' },
		{ capabilities: {} },
	);
	await client.connect(clientTransport);
	return {
		client,
		close: async () => {
			await client.close();
			await assembled.server.close();
		},
	};
};

describe('MCP metadata envelope compatibility', async () => {
	it('keeps structuredContent schema-valid when checkpointAdvisory is injected', async () => {
		const { client, close } = await connect(
			hostConfig(
				[
					registerTool('success', SUCCESS_SCHEMA, () =>
						toolOk({ value: 'pong' }),
					),
				],
				{
					getCheckpointAdvisory: () => ({
						triggered: true,
						code: 'SESSION_TOO_LONG',
						severity: 'recommend',
						message: 'checkpoint recommended',
						reason: 'session age crossed a local threshold',
						nextAction: 'create-semantic-checkpoint',
						dedupeKey: 'SESSION_TOO_LONG:s1:age',
					}),
				},
			),
		);
		try {
			const result = await client.callTool({
				name: 'spec_success',
				arguments: {},
			});
			const structured = (result as { structuredContent?: unknown })
				.structuredContent;
			expect(() => SUCCESS_SCHEMA.parse(structured)).not.toThrow();
			expect(
				(
					result as {
						_meta?: { checkpointAdvisory?: { code: string } };
					}
				)._meta?.checkpointAdvisory?.code,
			).toBe('SESSION_TOO_LONG');
		} finally {
			await close();
		}
	});

	it('keeps structuredContent schema-valid when stuck metadata is injected', async () => {
		const { client, close } = await connect(
			hostConfig(
				[
					registerTool('stuck', SUCCESS_SCHEMA, () =>
						toolOk({ value: 'pong' }),
					),
				],
				{
					isAgentStuck: () => ({
						handoffPath: '.cache/delendai/handoffs/agent.json',
						suggestedAction:
							'delegate the next slice to another agent',
					}),
				},
			),
		);
		try {
			const result = await client.callTool({
				name: 'spec_stuck',
				arguments: {},
			});
			const structured = (result as { structuredContent?: unknown })
				.structuredContent;
			expect(() => SUCCESS_SCHEMA.parse(structured)).not.toThrow();
			expect(
				(
					result as {
						_meta?: {
							stuck?: {
								detected: boolean;
								handoffPath: string;
								suggestedAction: string;
							};
						};
					}
				)._meta?.stuck,
			).toEqual({
				detected: true,
				handoffPath: '.cache/delendai/handoffs/agent.json',
				suggestedAction: 'delegate the next slice to another agent',
			});
		} finally {
			await close();
		}
	});

	it('keeps structuredContent schema-valid when logHint is injected onto an error result', async () => {
		const { client, close } = await connect(
			hostConfig([
				registerTool('failure', ERROR_SCHEMA, () =>
					toolError('boom', 'retry-later'),
				),
			]),
		);
		try {
			const result = await client.callTool({
				name: 'spec_failure',
				arguments: {},
			});
			const structured = (result as { structuredContent?: unknown })
				.structuredContent;
			expect(() => ERROR_SCHEMA.parse(structured)).not.toThrow();
			expect(
				(structured as Record<string, unknown> | undefined)?.logHint,
			).toBeUndefined();
			expect(
				(
					result as {
						_meta?: {
							logHint?: {
								path: string;
								line: number;
								ts: string;
							};
						};
					}
				)._meta?.logHint,
			).toMatchObject({
				line: 0,
			});
		} finally {
			await close();
		}
	});
});

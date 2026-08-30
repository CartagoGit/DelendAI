import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { describe, expect, it } from 'vitest';
import z from 'zod';

import {
	createMcpProject,
	planRegistrationOrder,
} from '@mcp-vertex/core/lib/project/create-mcp-project';
import { createWorkspacePathProvider } from '@mcp-vertex/core/lib/workspace/create-workspace-path-provider';
import type { IMcpVertexHostConfig } from '@mcp-vertex/core/lib/contracts/interfaces/host-config.interface';
import type {
	IResourceRegistration,
	IToolRegistration,
} from '@mcp-vertex/core/lib/contracts/interfaces/tool-registration.interface';

const registration = (
	id: string,
	registerAfter?: string,
	calls?: string[],
): IToolRegistration => ({
	id,
	registerAfter,
	register: async () => {
		calls?.push(id);
	},
});

const hostConfig = (
	extraTools: readonly IToolRegistration[],
): IMcpVertexHostConfig => ({
	metadata: {
		name: 'spec-server',
		version: '0.0.0',
		description: 'spec host',
	},
	namespacePrefix: 'spec',
	workspace: createWorkspacePathProvider('/tmp/spec-workspace'),
	validationMatrix: { scopes: {} },
	extraTools,
});

describe('planRegistrationOrder', async () => {
	it('appends extras without an anchor, preserving declaration order', async () => {
		const order = planRegistrationOrder(
			[registration('core-a'), registration('core-b')],
			[registration('x'), registration('y')],
		);
		expect(order.map((entry) => entry.id)).toEqual([
			'core-a',
			'core-b',
			'x',
			'y',
		]);
	});

	it('inserts an anchored extra immediately after its anchor', async () => {
		const order = planRegistrationOrder(
			[registration('core-a'), registration('core-b')],
			[registration('x', 'core-a')],
		);
		expect(order.map((entry) => entry.id)).toEqual([
			'core-a',
			'x',
			'core-b',
		]);
	});

	it('keeps declaration order for several extras on the same anchor', async () => {
		const order = planRegistrationOrder(
			[registration('core-a'), registration('core-b')],
			[registration('x', 'core-a'), registration('y', 'core-a')],
		);
		expect(order.map((entry) => entry.id)).toEqual([
			'core-a',
			'x',
			'y',
			'core-b',
		]);
	});

	it('throws on duplicate registration ids', async () => {
		expect(() =>
			planRegistrationOrder(
				[registration('core-a')],
				[registration('core-a')],
			),
		).toThrow(/duplicate registration id/u);
	});

	it('throws on an unknown registerAfter anchor', async () => {
		expect(() =>
			planRegistrationOrder([], [registration('x', 'missing')]),
		).toThrow(/unknown registerAfter anchor/u);
	});

	it('is deterministic: same input yields the same sequence', async () => {
		const build = (): readonly string[] =>
			planRegistrationOrder(
				[registration('core-a'), registration('core-b')],
				[
					registration('x', 'core-a'),
					registration('y'),
					registration('z', 'core-b'),
				],
			).map((entry) => entry.id);
		expect(build()).toEqual(build());
	});
});

describe('createMcpProject', async () => {
	it('registers extras in planned order and exposes registrationOrder', async () => {
		const calls: string[] = [];
		const assembled = await createMcpProject(
			hostConfig([
				registration('first', undefined, calls),
				registration('second', undefined, calls),
			]),
		);
		expect(calls).toEqual(['first', 'second']);
		expect(assembled.registrationOrder).toEqual(['first', 'second']);
	});

	it('exposes the underlying McpServer instance without connecting', async () => {
		const assembled = await createMcpProject(hostConfig([]));
		expect(assembled.server).toBeDefined();
		expect(assembled.registrationOrder).toEqual([]);
	});

	it('deduplicates knowledge resources registered by eager and lazy paths', async () => {
		let registrations = 0;
		const resource: IResourceRegistration = {
			id: 'resource:commit-policy',
			register: async () => {
				registrations += 1;
			},
		};
		const assembled = await createMcpProject({
			...hostConfig([]),
			extraResources: [resource, resource],
		});

		expect(registrations).toBe(1);
		await assembled.dispose();
	});
});

describe('instrumented tool hooks (f00111 S1)', async () => {
	const connect = async (config: IMcpVertexHostConfig) => {
		const assembled = await createMcpProject(config);
		const [clientTransport, serverTransport] =
			InMemoryTransport.createLinkedPair();
		await assembled.server.connect(serverTransport);
		const client = new Client(
			{ name: 'hooks-spec', version: '0' },
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

	it('fires onToolCancel once with elapsed ms when the client aborts mid-flight', async () => {
		const cancels: Array<{
			toolName: string;
			args: unknown;
			elapsedMs: number;
			context?: {
				reason: string;
				nextAction: string;
				error: unknown;
			};
		}> = [];
		const slowTool: IToolRegistration = {
			id: 'slow',
			register: async (server) => {
				server.registerTool(
					'spec_slow',
					{
						description: 'sleeps 300ms',
						inputSchema: z.object({ x: z.number() }),
					},
					async () => {
						await new Promise((resolve) =>
							setTimeout(resolve, 300),
						);
						return {
							content: [{ type: 'text' as const, text: 'done' }],
						};
					},
				);
			},
		};
		const { client, close } = await connect({
			...hostConfig([slowTool]),
			onToolCancel: (toolName, args, elapsedMs, context) => {
				cancels.push({
					toolName,
					args,
					elapsedMs,
					...(context !== undefined ? { context } : {}),
				});
			},
		});
		try {
			const controller = new AbortController();
			setTimeout(
				() =>
					controller.abort(new Error('user stopped duplicate work')),
				50,
			);
			await expect(
				client.callTool(
					{ name: 'spec_slow', arguments: { x: 1 } },
					undefined,
					{
						signal: controller.signal,
					},
				),
			).rejects.toThrow();
			// The handler is still sleeping; the abort listener has fired.
			await new Promise((resolve) => setTimeout(resolve, 400));
			expect(cancels).toHaveLength(1);
			expect(cancels[0]?.toolName).toBe('spec_slow');
			expect(cancels[0]?.args).toEqual({ x: 1 });
			expect(cancels[0]?.elapsedMs).toBeGreaterThan(0);
			expect(cancels[0]?.elapsedMs).toBeLessThan(300);
			expect(cancels[0]?.context?.reason).toBe(
				'user stopped duplicate work',
			);
			expect(cancels[0]?.context?.nextAction).toContain('Retry');
			expect(String(cancels[0]?.context?.error)).toContain(
				'user stopped duplicate work',
			);
		} finally {
			await close();
		}
	});

	it('reports an immediate abort at most once', async () => {
		const cancels: string[] = [];
		const slowTool: IToolRegistration = {
			id: 'immediate-abort',
			register: async (server) => {
				server.registerTool(
					'spec_immediate_abort',
					{
						description: 'waits briefly',
						inputSchema: z.object({}),
					},
					async () => {
						await new Promise((resolve) => setTimeout(resolve, 80));
						return {
							content: [{ type: 'text' as const, text: 'done' }],
						};
					},
				);
			},
		};
		const { client, close } = await connect({
			...hostConfig([slowTool]),
			onToolCancel: (toolName) => {
				cancels.push(toolName);
			},
		});
		try {
			const controller = new AbortController();
			const pending = client.callTool(
				{ name: 'spec_immediate_abort', arguments: {} },
				undefined,
				{ signal: controller.signal },
			);
			controller.abort();
			await expect(pending).rejects.toThrow();
			await new Promise((resolve) => setTimeout(resolve, 120));
			expect(cancels).toEqual(['spec_immediate_abort']);
		} finally {
			await close();
		}
	});

	it('passes {} (never the RequestHandlerExtra) to hooks for schema-less tools', async () => {
		const started: Array<{ toolName: string; args: unknown }> = [];
		const bareTool: IToolRegistration = {
			id: 'bare',
			register: async (server) => {
				server.registerTool(
					'spec_bare',
					{ description: 'no input schema' },
					async () => ({
						content: [{ type: 'text' as const, text: 'ok' }],
					}),
				);
			},
		};
		const { client, close } = await connect({
			...hostConfig([bareTool]),
			onToolStart: (toolName, args) => {
				started.push({ toolName, args });
			},
		});
		try {
			await client.callTool({ name: 'spec_bare', arguments: {} });
			expect(started).toHaveLength(1);
			expect(started[0]?.args).toEqual({});
		} finally {
			await close();
		}
	});

	it('reports host hook failures through onHookError without breaking the tool call', async () => {
		const hookErrors: Array<{
			hookName: string;
			toolName: string;
			args: unknown;
			error: unknown;
		}> = [];
		const pingTool: IToolRegistration = {
			id: 'hook-ping',
			register: async (server) => {
				server.registerTool(
					'spec_hook_ping',
					{
						description: 'hook ping',
						inputSchema: z.object({ value: z.number() }),
					},
					async () => ({
						content: [{ type: 'text' as const, text: 'ok' }],
					}),
				);
			},
		};
		const { client, close } = await connect({
			...hostConfig([pingTool]),
			onToolStart: () => {
				throw new Error('start boom');
			},
			onHookError: (info) => {
				hookErrors.push(info);
			},
		});
		try {
			const result = await client.callTool({
				name: 'spec_hook_ping',
				arguments: { value: 1 },
			});
			expect(result.isError).not.toBe(true);
			expect(hookErrors).toHaveLength(1);
			expect(hookErrors[0]).toEqual(
				expect.objectContaining({
					hookName: 'onToolStart',
					toolName: 'spec_hook_ping',
					args: { value: 1 },
				}),
			);
			expect(hookErrors[0]?.error).toBeInstanceOf(Error);
		} finally {
			await close();
		}
	});
});

describe('checkpoint advisory injection (f00156 S1)', async () => {
	const pingTool = (handlerInvoked: { n: number }): IToolRegistration => ({
		id: 'ping',
		register: async (server) => {
			server.registerTool(
				'spec_ping',
				{
					description: 'ping',
					inputSchema: z.object({}),
				},
				async () => {
					handlerInvoked.n += 1;
					return {
						content: [
							{ type: 'text' as const, text: '{"ok":true}' },
						],
						structuredContent: { ok: true },
					};
				},
			);
		},
	});

	const connect = async (config: IMcpVertexHostConfig) => {
		const assembled = await createMcpProject(config);
		const [clientTransport, serverTransport] =
			InMemoryTransport.createLinkedPair();
		await assembled.server.connect(serverTransport);
		const client = new Client(
			{ name: 'advisory-spec', version: '0' },
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

	it('injects a triggered advisory onto _meta', async () => {
		const invoked = { n: 0 };
		const { client, close } = await connect({
			...hostConfig([pingTool(invoked)]),
			getCheckpointAdvisory: () => ({
				triggered: true,
				code: 'SESSION_TOO_LONG',
				severity: 'recommend',
				message:
					'At this point, I recommend creating a semantic checkpoint and continuing in a fresh agent session.',
				reason: 'session age crossed the local MCP threshold',
				nextAction: 'checkpoint-and-fresh-session',
				dedupeKey: 'SESSION_TOO_LONG:s1:session-age',
			}),
		});
		try {
			const result = await client.callTool({
				name: 'spec_ping',
				arguments: {},
			});
			expect(invoked.n).toBe(1);
			expect(
				(
					(
						result as unknown as {
							_meta?: { checkpointAdvisory?: { code: string } };
						}
					)._meta as { checkpointAdvisory?: { code: string } }
				).checkpointAdvisory?.code,
			).toBe('SESSION_TOO_LONG');
		} finally {
			await close();
		}
	});

	it('does not re-inject the same dedupeKey on the next call', async () => {
		const invoked = { n: 0 };
		const { client, close } = await connect({
			...hostConfig([pingTool(invoked)]),
			getCheckpointAdvisory: () => ({
				triggered: true,
				code: 'SESSION_TOO_LONG',
				severity: 'recommend',
				message: 'At this point, I recommend a checkpoint.',
				reason: 'age',
				nextAction: 'checkpoint-and-fresh-session',
				dedupeKey: 'SESSION_TOO_LONG:s1:session-age',
			}),
		});
		try {
			const first = await client.callTool({
				name: 'spec_ping',
				arguments: {},
			});
			const second = await client.callTool({
				name: 'spec_ping',
				arguments: {},
			});
			expect(
				(
					first as unknown as {
						_meta?: { checkpointAdvisory?: unknown };
					}
				)._meta?.checkpointAdvisory,
			).toBeDefined();
			expect(
				(
					second as unknown as {
						_meta?: { checkpointAdvisory?: unknown };
					}
				)._meta?.checkpointAdvisory,
			).toBeUndefined();
		} finally {
			await close();
		}
	});

	it('short-circuits the handler when beforeToolCall returns severity block', async () => {
		const invoked = { n: 0 };
		const { client, close } = await connect({
			...hostConfig([pingTool(invoked)]),
			beforeToolCall: () => ({
				triggered: true,
				code: 'STALE_ACCEPTANCE',
				severity: 'block',
				message: 'At this point, I recommend not pushing yet.',
				reason: 'acceptance evidence is stale',
				nextAction: 'validate-before-push',
				dedupeKey: 'STALE_ACCEPTANCE:s1:tree',
			}),
		});
		try {
			const result = await client.callTool({
				name: 'spec_ping',
				arguments: {},
			});
			expect(invoked.n).toBe(0);
			expect(result.isError).toBe(true);
			expect(
				(
					(
						result as unknown as {
							_meta?: {
								checkpointAdvisory?: { severity: string };
							};
						}
					)._meta as { checkpointAdvisory?: { severity: string } }
				).checkpointAdvisory?.severity,
			).toBe('block');
		} finally {
			await close();
		}
	});
});

/**
 * A plugin loaded on demand keeps a server that reaches the host.
 */
import z from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

import { describe, expect, it } from 'vitest';

import { fakePartial } from '@delendai/test-kit';

import {
	captureServer,
	createHostServerSlot,
} from '@delendai/core/lib/plugins/capture-server';
import { createManagedLazyRuntime } from '@delendai/core/lib/plugins/managed-lazy-runtime';

const logged: unknown[] = [];
const liveServer = fakePartial<McpServer, 'sendLoggingMessage'>({
	sendLoggingMessage(message) {
		logged.push({ via: Reflect.get(this, 'name'), message });
		return Promise.resolve();
	},
});
Reflect.set(liveServer, 'name', 'live');

describe('the server a captured plugin is given', () => {
	it('records registerTool itself, and hands everything else to the live server', async () => {
		const registered: string[] = [];
		const server = captureServer(
			(name: string) => {
				registered.push(name);
			},
			() => liveServer,
		);

		server.registerTool('a_tool', {}, async () => ({ content: [] }));
		await server.sendLoggingMessage({ level: 'info', data: 'hi' });

		expect(registered).toEqual(['a_tool']);
		expect(logged.at(-1)).toEqual({
			via: 'live',
			message: { level: 'info', data: 'hi' },
		});
	});

	it('drops a log message while no server exists yet, instead of throwing', async () => {
		const server = captureServer(() => undefined);
		await expect(
			server.sendLoggingMessage({ level: 'info', data: 'early' }),
		).resolves.toBeUndefined();
		expect(Reflect.get(server, 'server')).toBeUndefined();
	});

	it('reads the slot when used, not when captured', () => {
		const slot = createHostServerSlot();
		const server = captureServer(() => undefined, slot.get);
		expect(Reflect.get(server, 'name')).toBeUndefined();
		slot.set(liveServer);
		expect(Reflect.get(server, 'name')).toBe('live');
	});
});

describe('a plugin activated by the managed lazy runtime', () => {
	it('can notify the host through the server it kept', async () => {
		let kept: McpServer | undefined;
		const slot = createHostServerSlot();
		const runtime = createManagedLazyRuntime({
			namespacePrefix: 'delendai',
			liveServer: slot.get,
			plugins: [
				{
					id: 'demo',
					packageSpecifier: '@delendai/demo',
					toolIds: ['echo'],
					promptIds: [],
					resourceIds: [],
					knowledgeIds: [],
					skillIds: [],
					dependencies: [],
				},
			],
			namespaces: new Map([['demo', 'demo']]),
			buildContext: () => fakePartial({}),
			importFn: async () => ({
				default: {
					name: 'demo',
					register: async () => ({
						tools: [
							{
								id: 'echo',
								register: async (server: McpServer) => {
									kept = server;
									server.registerTool(
										'delendai_demo_echo',
										{
											inputSchema: z.object({}),
											outputSchema: z.object({}),
										},
										async () => ({ content: [] }),
									);
								},
							},
						],
					}),
				},
			}),
		});
		slot.set(liveServer);

		await runtime.activateTool('delendai_demo_echo');
		await kept?.sendLoggingMessage({ level: 'warning', data: 'advisory' });

		expect(logged.at(-1)).toEqual({
			via: 'live',
			message: { level: 'warning', data: 'advisory' },
		});
	});
});

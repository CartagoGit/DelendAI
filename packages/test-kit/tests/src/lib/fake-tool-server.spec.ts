import { describe, expect, it } from 'vitest';

import { createFakeToolServer } from '@mcp-vertex/test-kit/public';
import type { IFakeRegisteredTool } from '@mcp-vertex/test-kit/public';

/**
 * `createFakeToolServer` centralises the ONE `as unknown as McpServer`
 * cast this repo's tests need — see the module doc in
 * `src/lib/fake-tool-server.ts` for why `fakePartial` cannot close this
 * particular gap (McpServer's `registerTool` is a generic, overloaded
 * SDK method; no concrete fake function is structurally assignable to
 * a generic method property). These specs prove the runtime behaviour
 * every migrated call site relies on: hooks fire with the right shape,
 * and calling `registerTool`/`sendLoggingMessage` on the returned value
 * behaves like a real `McpServer` would from the caller's point of view.
 */
describe('createFakeToolServer', () => {
	it('routes registerTool calls to onRegisterTool with name/config/handler', async () => {
		const calls: IFakeRegisteredTool[] = [];
		const server = createFakeToolServer({
			onRegisterTool: (call) => calls.push(call),
		});

		const handler = async () => ({ content: [] });
		server.registerTool('demo_tool', { title: 'Demo' }, handler);

		expect(calls).toHaveLength(1);
		expect(calls[0]?.name).toBe('demo_tool');
		expect(calls[0]?.config).toEqual({ title: 'Demo' });
		await expect(calls[0]?.handler({})).resolves.toEqual({ content: [] });
	});

	it('routes sendLoggingMessage calls to onSendLoggingMessage', async () => {
		const messages: unknown[] = [];
		const server = createFakeToolServer({
			onSendLoggingMessage: (message) => {
				messages.push(message);
			},
		});

		await server.sendLoggingMessage({ level: 'info', data: { ok: true } });

		expect(messages).toEqual([{ level: 'info', data: { ok: true } }]);
	});

	it('is safe to call with no overrides at all (hooks are optional)', () => {
		const server = createFakeToolServer();
		expect(() =>
			server.registerTool('x', {}, async () => ({ content: [] })),
		).not.toThrow();
	});
});

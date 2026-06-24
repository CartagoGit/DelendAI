/**
 * reload-no-leak.spec.ts — pinning contract for the r00003 S4 lifecycle
 * (extensions/vscode/src/extension.ts: `activate` -> `deactivate`).
 *
 * Before this test, every window reload leaked:
 *   - the stdio child process (`bun run mcp-vertex`), because nothing
 *     ever called `client.close()`;
 *   - the runtime handle was populated with no client-disposable, so
 *     even the listeners we DID track could not stop the client.
 *
 * The test wires an `activate()` -> `deactivate()` round-trip and
 * asserts `client.close()` was invoked exactly once.
 */
import { describe, expect, it } from 'vitest';

import { McpStdioClient, type IOverview } from '@mcp-vertex/client';

import {
	activate,
	deactivate,
	__resetRuntimeHandle,
	getRuntimeHandle,
	type IExtensionContext,
	type IVscodeApi,
} from '../extension';

const overviewFixture: IOverview = {
	server: { name: 'mcp-vertex', version: '0.1.0' },
	namespacePrefix: 'mcp-vertex',
	plugins: ['core'],
	tools: ['mcp-vertex_overview'],
	knowledge: [],
	recommendedNextAction: 'Call overview first.',
};

const fakeVscode = (): IVscodeApi => ({
	ViewColumn: { One: 1 },
	commands: {
		registerCommand() {
			return { dispose() {} };
		},
	},
	window: {
		createWebviewPanel() {
			return { webview: { html: '' } };
		},
	},
});

interface ITrackedClient {
	readonly client: McpStdioClient;
	readonly closeCalls: number;
}

const makeTrackedClient = (): ITrackedClient => {
	const closeCalls = { count: 0 };
	const transport = {
		async callTool() {
			return { structuredContent: overviewFixture };
		},
		async close() {
			closeCalls.count += 1;
		},
		async listTools() {
			return { tools: [] };
		},
	};
	const client = McpStdioClient.fromTransport(transport);
	return {
		client,
		get closeCalls() {
			return closeCalls.count;
		},
	};
};

describe('activate / deactivate lifecycle (reload-leak contract)', async () => {
	it('deactivate calls client.close() exactly once', async () => {
		__resetRuntimeHandle();
		const tracked = makeTrackedClient();
		const context: IExtensionContext = {
			subscriptions: [],
			globalState: {
				get<T>(): T | undefined {
					return undefined;
				},
				async update() {
					/* no-op */
				},
			},
		};
		await activate(context, {
			vscode: fakeVscode(),
			createClient: async () => tracked.client,
		});

		// r00003 S4: the handle must own MORE than just the client — every
		// command subscription and the dashboard webview now register
		// through the `track()` seam, so a host-driven `deactivate()` (which
		// VS Code calls with no context) can dispose them. A count of 1
		// would mean only the client was tracked and the commands leaked.
		expect(getRuntimeHandle()?.count ?? 0).toBeGreaterThan(1);
		// No close yet — the client is in use.
		expect(tracked.closeCalls).toBe(0);

		await deactivate();

		expect(tracked.closeCalls).toBe(1);
		// The handle is drained; the next `activate()` must start fresh.
		expect(getRuntimeHandle()).toBeUndefined();
	});

	it('failed activate clears the runtime handle (no stale slot)', async () => {
		__resetRuntimeHandle();
		const context: IExtensionContext = {
			subscriptions: [],
			globalState: {
				get<T>(): T | undefined {
					return undefined;
				},
				async update() {
					/* no-op */
				},
			},
		};

		await expect(
			activate(context, {
				vscode: fakeVscode(),
				createClient: async () => {
					throw new Error('bun not on PATH');
				},
			}),
		).rejects.toThrow(/bun not on PATH/);

		// Critical: the handle must NOT survive a failed activation,
		// otherwise the next `activate()` inherits a half-populated slot
		// and `deactivate()` will tear down disposables from a previous
		// lifetime.
		expect(getRuntimeHandle()).toBeUndefined();

		// And `deactivate()` must be a no-op (handle is already gone).
		await expect(deactivate()).resolves.toBeUndefined();
	});
});

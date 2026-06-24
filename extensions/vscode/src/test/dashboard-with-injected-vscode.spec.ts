/**
 * dashboard-with-injected-vscode.spec.ts — pinning contract for the
 * dashboard registration in `extensions/vscode/src/extension.ts`.
 *
 * Before this test, `registerOpenDashboardCommand` was only called when
 * `deps.vscode === undefined` (the production-only branch). Test fakes
 * that inject a minimal `IVscodeApi` would silently miss the dashboard
 * command. We now always register it; this test pins the behaviour for
 * the test-injected path so a regression that hides the dashboard
 * behind the `if (deps.vscode === undefined)` gate would fail here.
 */
import { describe, expect, it } from 'vitest';

import { McpStdioClient, type IOverview } from '@mcp-vertex/client';

import {
	activate,
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

describe('dashboard registration with injected vscode', async () => {
	it('registers mcp-vertex.openDashboard even when deps.vscode is provided', async () => {
		const commands = new Map<
			string,
			(...args: readonly unknown[]) => unknown
		>();
		const panels: Array<{ webview: { html: string } }> = [];
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
		const vscode: IVscodeApi = {
			ViewColumn: { One: 1 },
			commands: {
				registerCommand(command, callback) {
					commands.set(command, callback);
					return { dispose() {} };
				},
			},
			window: {
				createWebviewPanel() {
					const panel = { webview: { html: '' } };
					panels.push(panel);
					return panel;
				},
			},
		};
		const client = McpStdioClient.fromTransport({
			async callTool() {
				return { structuredContent: overviewFixture };
			},
		});

		await activate(context, {
			vscode,
			createClient: async () => client,
		});

		expect(commands.has('mcp-vertex.openDashboard')).toBe(true);

		// Invoking the registered command must produce a panel whose
		// HTML is the rendered dashboard (i.e. goes through the
		// fake-host adapter, not the no-op stub).
		await commands.get('mcp-vertex.openDashboard')?.();
		expect(panels.length).toBeGreaterThanOrEqual(1);
		const html = panels[panels.length - 1]?.webview.html ?? '';
		expect(html.length).toBeGreaterThan(0);
	});
});

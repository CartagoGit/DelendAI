import { describe, expect, it } from 'vitest';

import { McpStdioClient, type IOverview } from '@mcp-vertex/client';

import {
	activate,
	CLIENT_STATE_KEY,
	OPEN_PROPOSAL_COMMAND,
	OPEN_SETTINGS_COMMAND,
	renderOverviewHtml,
	REFRESH_COMMAND,
	RUN_VALIDATION_COMMAND,
	SHOW_METRICS_COMMAND,
	SHOW_OVERVIEW_COMMAND,
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

describe('VS Code extension smoke', () => {
	it('activates, stores the client and registers showOverview', async () => {
		const stored = new Map<string, unknown>();
		const subscriptions: Array<{ dispose(): void }> = [];
		const commands = new Map<
			string,
			(...args: readonly unknown[]) => unknown
		>();
		const panels: Array<{ webview: { html: string } }> = [];
		const context: IExtensionContext = {
			subscriptions,
			globalState: {
				async update(key, value) {
					stored.set(key, value);
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
			async callTool(input) {
				expect(input).toEqual({
					name: 'mcp-vertex_overview',
					arguments: { compact: false },
				});
				return { structuredContent: overviewFixture };
			},
		});

		await activate(context, {
			vscode,
			createClient: async () => client,
		});

		expect(stored.get(CLIENT_STATE_KEY)).toBe(client);
		// f125 + f126/f00026: original commands + observability commands.
		expect(subscriptions).toHaveLength(11);
		expect(commands.has(REFRESH_COMMAND)).toBe(true);
		expect(commands.has(RUN_VALIDATION_COMMAND)).toBe(true);
		expect(commands.has(OPEN_PROPOSAL_COMMAND)).toBe(true);
		expect(commands.has(SHOW_METRICS_COMMAND)).toBe(true);
		expect(commands.has(OPEN_SETTINGS_COMMAND)).toBe(true);

		await commands.get(SHOW_OVERVIEW_COMMAND)?.();

		expect(panels).toHaveLength(1);
		expect(panels[0]?.webview.html).toContain('mcp-vertex Overview');
		expect(panels[0]?.webview.html).toContain('mcp-vertex_overview');
	});

	it('escapes overview content before rendering HTML', () => {
		const html = renderOverviewHtml({
			...overviewFixture,
			server: { name: '<mcp>&"vertex"', version: '0.1.0' },
		});

		expect(html).toContain('&lt;mcp&gt;&amp;\\&quot;vertex\\&quot;');
		expect(html).not.toContain('<mcp>&"vertex"');
	});
});

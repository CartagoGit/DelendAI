import { describe, expect, it } from 'vitest';

import { McpStdioClient, type IOverview } from '@mcp-vertex/client';

import {
	activate,
	CLIENT_STATE_KEY,
	deactivate,
	__resetRuntimeHandle,
	getRuntimeHandle,
	OPEN_PROPOSAL_COMMAND,
	OPEN_SETTINGS_COMMAND,
	renderOverviewHtml,
	REFRESH_COMMAND,
	RUN_VALIDATION_COMMAND,
	SHOW_METRICS_COMMAND,
	SHOW_OVERVIEW_COMMAND,
	SETUP_GITHUB_COMMAND,
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
				get<T>(key: string): T | undefined {
					return stored.get(key) as T | undefined;
				},
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
					arguments: { compact: true },
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
		// f00047 S5: +1 for the new mcp-vertex.openToolbar command.
		// f00030 S4: +1 for the new mcp-vertex.setupGithub command.
		expect(subscriptions).toHaveLength(13);
		expect(commands.has(REFRESH_COMMAND)).toBe(true);
		expect(commands.has(RUN_VALIDATION_COMMAND)).toBe(true);
		expect(commands.has(OPEN_PROPOSAL_COMMAND)).toBe(true);
		expect(commands.has(SHOW_METRICS_COMMAND)).toBe(true);
		expect(commands.has(OPEN_SETTINGS_COMMAND)).toBe(true);
		expect(commands.has(SETUP_GITHUB_COMMAND)).toBe(true);

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

	// r00003 S4: `deactivate` must drain the runtime handle that
	// `activate` populated. Before this regression test, `deactivate`
	// was empty and the status bar item, watchers and the stdio
	// client leaked on every window reload.
	it('deactivate drains the runtime handle populated by activate', async () => {
		__resetRuntimeHandle();
		const subscriptions: Array<{ dispose(): void }> = [];
		const context: IExtensionContext = {
			subscriptions,
			globalState: {
				get<T>(): T | undefined {
					return undefined;
				},
				async update() {
					// no-op
				},
			},
		};
		const vscode: IVscodeApi = {
			ViewColumn: { One: 1 },
			commands: {
				registerCommand() {
					return { dispose() {} };
				},
			},
			window: {
				createStatusBarItem() {
					// Minimal stand-in for the VS Code status bar item; the
					// extension only assigns `command` and `tooltip` to it.
					return {
						command: undefined,
						tooltip: undefined,
						text: '',
						show() {},
						hide() {},
						dispose() {},
					} as unknown as ReturnType<
						NonNullable<IVscodeApi['window']['createStatusBarItem']>
					>;
				},
				createWebviewPanel() {
					return { webview: { html: '' } };
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

		const handle = getRuntimeHandle();
		expect(handle).toBeDefined();
		// The smoke test's baseline activation registers 13 disposables
		// (status bar + 2 trees + 1 watcher + 9 commands). Even if a
		// future slice changes that number, the contract is "at least 1
		// disposable was tracked" — which is what proves the handle was
		// actually wired up.
		expect(handle?.count ?? 0).toBeGreaterThanOrEqual(1);

		await deactivate();

		expect(getRuntimeHandle()).toBeUndefined();
	});
});

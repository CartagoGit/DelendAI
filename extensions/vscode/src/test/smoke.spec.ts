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

describe('VS Code extension smoke', async () => {
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
		// f00047 S6 (settings wire-up): +3 for openDocs / saveSettings /
		//   resetSettings — `renderSettings` posts to these commands, and
		//   previously they were unregistered so saves were silently
		//   dropped.
		// f00047 S6 (dashboard-always-registers): +1 for openDashboard,
		//   which is now wired even when `deps.vscode` is injected (the
		//   smoke test injects vscode → dashboard now shows up here).
		// f00053 S6: +1 for the new mcp-vertex.openDocsApi command.
		expect(subscriptions).toHaveLength(18);
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

	// Fix for "Error spawn bun ENOENT" on hosts where `bun` is not on
	// the extension host's PATH (WSL installs at ~/.bun/bin/bun, custom
	// devcontainer images, CI runners without a login shell profile).
	// The extension must read `mcp-vertex.server.command` / `server.args`
	// from the workspace configuration and forward them to the spawn
	// instead of hardcoding `bun run mcp-vertex`.
	it('createDefaultClient honours mcp-vertex.server.command and server.args', async () => {
		const calls: Array<{ command: string; args: readonly string[] }> = [];
		const vscode: IVscodeApi = {
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
			workspace: {
				createFileSystemWatcher() {
					return {
						onDidChange() {
							return { dispose() {} };
						},
						onDidCreate() {
							return { dispose() {} };
						},
						onDidDelete() {
							return { dispose() {} };
						},
						dispose() {},
					};
				},
				getConfiguration(section) {
					expect(section).toBe('mcp-vertex.server');
					return {
						get<T>(key: string, defaultValue?: T): T | undefined {
							if (key === 'command')
								return '/home/cartago/.bun/bin/bun' as unknown as T;
							if (key === 'args')
								return [
									'run',
									'mcp-vertex',
									'--preset=swarm',
								] as unknown as T;
							return defaultValue;
						},
					};
				},
			},
		};
		// Intercept the real connect path so we can assert the spawn
		// payload without standing up a stdio transport.
		const originalConnect = McpStdioClient.connect;
		McpStdioClient.connect = (async (opts: {
			command: string;
			args: readonly string[];
		}) => {
			calls.push({ command: opts.command, args: opts.args });
			return McpStdioClient.fromTransport({
				async callTool() {
					return { structuredContent: overviewFixture };
				},
			});
		}) as typeof McpStdioClient.connect;
		try {
			const { createDefaultClient } = await import('../extension');
			const client = await createDefaultClient(vscode);
			expect(client).toBeDefined();
		} finally {
			McpStdioClient.connect = originalConnect;
		}

		expect(calls).toHaveLength(1);
		expect(calls[0]?.command).toBe('/home/cartago/.bun/bin/bun');
		expect(calls[0]?.args).toEqual(['run', 'mcp-vertex', '--preset=swarm']);
	});

	it('createDefaultClient falls back to `bun run mcp-vertex` when no configuration is provided', async () => {
		const calls: Array<{ command: string; args: readonly string[] }> = [];
		const vscode: IVscodeApi = {
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
			// No `workspace` surface — simulates the minimal host stubs used
			// by other specs (reload-no-leak, dashboard-with-injected-vscode).
		};
		const originalConnect = McpStdioClient.connect;
		McpStdioClient.connect = (async (opts: {
			command: string;
			args: readonly string[];
		}) => {
			calls.push({ command: opts.command, args: opts.args });
			return McpStdioClient.fromTransport({
				async callTool() {
					return { structuredContent: overviewFixture };
				},
			});
		}) as typeof McpStdioClient.connect;
		try {
			const { createDefaultClient } = await import('../extension');
			await createDefaultClient(vscode);
		} finally {
			McpStdioClient.connect = originalConnect;
		}

		expect(calls).toEqual([
			{ command: 'bun', args: ['run', 'mcp-vertex'] },
		]);
	});

	it('escapes overview content before rendering HTML', async () => {
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

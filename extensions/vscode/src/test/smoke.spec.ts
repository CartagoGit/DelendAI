import { describe, expect, it } from 'vitest';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { McpStdioClient, type IOverview } from '@mcp-vertex/client';

import {
	activate,
	CLIENT_STATE_KEY,
	deactivate,
	__resetRuntimeHandle,
	getRuntimeHandle,
	OPEN_PROPOSAL_COMMAND,
	OPEN_SETTINGS_COMMAND,
	OPEN_TOOL_DETAIL_COMMAND,
	renderOverviewHtml,
	REFRESH_COMMAND,
	resolveServerCommand,
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

const createFileSystemWatcher = () => ({
	onDidChange: () => ({ dispose() {} }),
	onDidCreate: () => ({ dispose() {} }),
	onDidDelete: () => ({ dispose() {} }),
});

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
			workspace: {
				createFileSystemWatcher,
				getConfiguration: () => ({
					get<T>(key: string, defaultValue?: T): T | undefined {
						if (key === 'command') return 'node' as unknown as T;
						if (key === 'args')
							return ['server.js'] as unknown as T;
						return defaultValue;
					},
				}),
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

		expect(stored.get(CLIENT_STATE_KEY)).toBeInstanceOf(McpStdioClient);
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
		// f00056 S3: +1 for the new mcp-vertex.openAgentCatalog command
		//   that drives the AgentCatalogService-backed webview.
		// f00097 S4: +2 for mcp-vertex.proposals.refresh and
		//   mcp-vertex.proposals.copyError (the board's local commands).
		// f00098 S3: +6 for the provider dashboard command set
		//   (providers.openDashboard / healthcheck / pause / resume,
		//   usage.report / usage.clear).
		// f00068 S5 (2026-07-11): +1 for mcp-vertex.externalMcps.ack, the
		//   external-server activation ack command. The non-modal
		//   pending-ack notification is fire-and-forget (not tracked).
		// f00100 S1: +1 for mcp-vertex.openToolDetail, wired from tool-tree
		//   leaves to the existing tool-detail webview renderer.
		// f00107 S3: +1 plugin activation switchboard command.
		// Configuration Center host command adds one lifecycle-tracked registration.
		// f00119 S6: +1 auto-agent-selector panel command.
		// f00192 S1: +1 openAgentTimeline command.
		// KPI sidebar provider adds one lifecycle registration.
		// Main shared dashboard webview view adds one lifecycle registration.
		// Runtime observer adds one lifecycle registration in addition to
		// the runtime log command.
		expect(subscriptions).toHaveLength(38);
		expect(commands.has(REFRESH_COMMAND)).toBe(true);
		expect(commands.has('mcp-vertex.proposals.refresh')).toBe(true);
		expect(commands.has('mcp-vertex.proposals.copyError')).toBe(true);
		expect(commands.has(RUN_VALIDATION_COMMAND)).toBe(true);
		expect(commands.has(OPEN_PROPOSAL_COMMAND)).toBe(true);
		expect(commands.has(OPEN_TOOL_DETAIL_COMMAND)).toBe(true);
		expect(commands.has(SHOW_METRICS_COMMAND)).toBe(true);
		expect(commands.has(OPEN_SETTINGS_COMMAND)).toBe(true);
		expect(commands.has(SETUP_GITHUB_COMMAND)).toBe(true);

		await commands.get(SHOW_OVERVIEW_COMMAND)?.();

		expect(panels).toHaveLength(1);
		expect(panels[0]?.webview.html).toContain('mcp-vertex Overview');
		expect(panels[0]?.webview.html).toContain('mcp-vertex_overview');
	});

	it('keeps activation successful when global state persistence rejects', async () => {
		const context: IExtensionContext = {
			subscriptions: [],
			globalState: {
				get<T>(): T | undefined {
					return undefined;
				},
				update: async () => {
					throw new Error('state unavailable');
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
				createWebviewPanel() {
					return { webview: { html: '' } };
				},
			},
			workspace: {
				createFileSystemWatcher,
				getConfiguration: () => ({
					get<T>(key: string, defaultValue?: T): T | undefined {
						if (key === 'command') return 'node' as unknown as T;
						if (key === 'args')
							return ['server.js'] as unknown as T;
						return defaultValue;
					},
				}),
			},
		};
		const client = McpStdioClient.fromTransport({
			async callTool() {
				return { structuredContent: overviewFixture };
			},
		});

		await expect(
			activate(context, { vscode, createClient: async () => client }),
		).resolves.toBeUndefined();
		await deactivate();
	});

	it('keeps the extension alive and reconnects after an initial MCP failure', async () => {
		const commands = new Map<
			string,
			(...args: readonly unknown[]) => unknown
		>();
		const context: IExtensionContext = {
			subscriptions: [],
			globalState: {
				get<T>(): T | undefined {
					return undefined;
				},
				async update() {},
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
					return { webview: { html: '' } };
				},
				async showErrorMessage() {
					return undefined;
				},
			},
			workspace: {
				createFileSystemWatcher,
				getConfiguration: () => ({
					get<T>(key: string, defaultValue?: T): T | undefined {
						if (key === 'command') return 'node' as unknown as T;
						if (key === 'args')
							return ['server.js'] as unknown as T;
						return defaultValue;
					},
				}),
			},
		};
		const connected = McpStdioClient.fromTransport({
			async callTool() {
				return { structuredContent: overviewFixture };
			},
		});
		let attempts = 0;
		const createClient = async (): Promise<McpStdioClient> => {
			attempts += 1;
			if (attempts === 1) throw new Error('server is starting');
			return connected;
		};

		await expect(
			activate(context, { vscode, createClient }),
		).resolves.toBeUndefined();
		expect(commands.has('mcp-vertex.providers.healthcheck')).toBe(true);
		expect(commands.has('mcp-vertex.restartServer')).toBe(true);

		await commands.get('mcp-vertex.restartServer')?.();
		expect(attempts).toBe(2);
		await deactivate();
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

	it('createDefaultClient refuses to spawn when no configuration is provided', async () => {
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
			await expect(createDefaultClient(vscode)).rejects.toThrow(
				'mcp-vertex.server.command and mcp-vertex.server.args',
			);
		} finally {
			McpStdioClient.connect = originalConnect;
		}

		expect(calls).toEqual([]);
	});

	it('resolveServerCommand prefers the workspace MCP launch configuration', async () => {
		// Hermetic: the workspace gets its own canonical `.mcp.json`
		// instead of depending on the live repo root, where concurrent
		// workers may change the file under test.
		const workspaceRoot = await mkdtemp(
			join(tmpdir(), 'mcp-vertex-vscode-launch-'),
		);
		await writeFile(
			join(workspaceRoot, '.mcp.json'),
			JSON.stringify({
				mcpServers: {
					'mcp-vertex': {
						command: 'bun',
						args: [
							'tools/scripts/host/host-server.script.ts',
							'--workspace=.',
						],
					},
				},
			}),
			'utf8',
		);
		try {
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
					workspaceFolders: [{ uri: { fsPath: workspaceRoot } }],
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
					getConfiguration() {
						return {
							get<T>(
								_key: string,
								defaultValue?: T,
							): T | undefined {
								return defaultValue;
							},
						};
					},
				},
			};

			const launch = await resolveServerCommand(vscode);
			expect(launch).toEqual({
				command: 'bun',
				args: [
					'tools/scripts/host/host-server.script.ts',
					'--workspace=.',
				],
				cwd: workspaceRoot,
			});
		} finally {
			await rm(workspaceRoot, { recursive: true, force: true });
		}
	});

	it('resolveServerCommand falls back to bun for a configured workspace without .mcp.json', async () => {
		const workspaceRoot = await mkdtemp(
			join(tmpdir(), 'mcp-vertex-vscode-'),
		);
		await writeFile(
			join(workspaceRoot, 'mcp-vertex.config.json'),
			'{}\n',
			'utf8',
		);
		try {
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
					workspaceFolders: [{ uri: { fsPath: workspaceRoot } }],
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
					getConfiguration() {
						return {
							get<T>(
								_key: string,
								defaultValue?: T,
							): T | undefined {
								return defaultValue;
							},
						};
					},
				},
			};

			expect(await resolveServerCommand(vscode)).toEqual({
				command: 'bun',
				args: ['run', 'mcp-vertex'],
				cwd: workspaceRoot,
			});
		} finally {
			await rm(workspaceRoot, { recursive: true, force: true });
		}
	});

	it('routes child stderr to the VS Code startup-report output channel', async () => {
		const output: string[] = [];
		const channel = {
			append(value: string) {
				output.push(value);
			},
			dispose() {},
		};
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
				createFileSystemWatcher,
				getConfiguration: () => ({
					get<T>(key: string, defaultValue?: T): T | undefined {
						if (key === 'command') return 'node' as unknown as T;
						if (key === 'args')
							return ['server.js'] as unknown as T;
						return defaultValue;
					},
				}),
			},
		};
		const originalConnect = McpStdioClient.connect;
		McpStdioClient.connect = (async (opts: {
			onStderr?: (chunk: string) => void;
		}) => {
			opts.onStderr?.('MCP-Vertex ready\\n');
			return McpStdioClient.fromTransport({
				async callTool() {
					return { structuredContent: overviewFixture };
				},
			});
		}) as typeof McpStdioClient.connect;
		try {
			const { createDefaultClient } = await import('../extension');
			await createDefaultClient(vscode, channel);
		} finally {
			McpStdioClient.connect = originalConnect;
		}

		expect(output).toEqual(['MCP-Vertex ready\\n']);
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

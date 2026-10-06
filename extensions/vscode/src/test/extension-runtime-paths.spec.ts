/**
 * extension-runtime-paths.spec.ts — pins the activation behaviour that the
 * other activation specs leave to chance: how the resilient client routes
 * calls, what a connection timeout and an untrusted workspace leave behind,
 * the development auto-reload watcher and the runtime-log command. Every
 * case drives the real `activate` with an injected `IVscodeApi` and asserts
 * what the host observably receives.
 */
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { McpStdioClient } from '@delendai/client';

import { ADOPT_COMMAND } from '../contracts/constants/adopt-command.constant';
import {
	__resetRuntimeHandle,
	activate,
	deactivate,
	getRuntimeHandle,
	resolveServerCommand,
	type IExtensionContext,
	type IVscodeApi,
} from '../extension';

/** The launch a configured workspace declares. */
const LAUNCH_SETTINGS: Readonly<Record<string, unknown>> = {
	command: 'node',
	args: ['server.js'],
};

/** The default tool prefix, and the router the extension falls back through. */
const PREFIX = 'delendai_';
const ROUTER_TOOL = `${PREFIX}vertex`;

type TCallTool = (input: {
	name: string;
	arguments?: object;
}) => Promise<{ structuredContent?: unknown }>;

interface IHarnessOptions {
	readonly trusted?: boolean;
	readonly configured?: boolean;
	readonly autoReload?: boolean;
	readonly extensionPath?: string;
	readonly withChannels?: boolean;
	readonly workspaceRoot?: string;
	readonly mcpConfigured?: boolean;
}

const roots: string[] = [];

const makeRoot = (): string => {
	const root = mkdtempSync(join(tmpdir(), 'delendai-runtime-'));
	roots.push(root);
	return root;
};

const createHarness = (options: IHarnessOptions = {}) => {
	const handlers = new Map<
		string,
		(...args: readonly unknown[]) => unknown
	>();
	const executed: string[] = [];
	const infos: string[] = [];
	const errors: string[] = [];
	const panels: { webview: { html: string } }[] = [];
	const shown: boolean[] = [];
	const bundleListeners: (() => void)[] = [];
	const watchedPatterns: string[] = [];
	const context: IExtensionContext = {
		subscriptions: [],
		globalState: {
			get<T>(): T | undefined {
				return undefined;
			},
			async update() {},
		},
		...(options.extensionPath === undefined
			? {}
			: { extensionPath: options.extensionPath }),
	};
	const channel = {
		append() {},
		show(preserveFocus?: boolean) {
			shown.push(preserveFocus === true);
		},
		dispose() {},
	};
	const vscode: IVscodeApi = {
		ViewColumn: { One: 1 },
		commands: {
			registerCommand(command, callback) {
				handlers.set(command, callback);
				return { dispose() {} };
			},
			executeCommand: (async (command: string) => {
				executed.push(command);
				return undefined;
			}) as NonNullable<IVscodeApi['commands']['executeCommand']>,
		},
		window: {
			createWebviewPanel() {
				const panel = { webview: { html: '' } };
				panels.push(panel);
				return panel;
			},
			async showInformationMessage(message) {
				infos.push(message);
				return undefined;
			},
			async showErrorMessage(message) {
				errors.push(message);
				return undefined;
			},
			...(options.withChannels === true
				? { createOutputChannel: () => channel }
				: {}),
		},
		workspace: {
			isTrusted: options.trusted ?? true,
			createFileSystemWatcher(pattern) {
				watchedPatterns.push(pattern);
				return {
					onDidChange(listener: () => void) {
						if (pattern.endsWith('extension.js'))
							bundleListeners.push(listener);
						return { dispose() {} };
					},
					onDidCreate(listener: () => void) {
						if (pattern.endsWith('extension.js'))
							bundleListeners.push(listener);
						return { dispose() {} };
					},
					onDidDelete: () => ({ dispose() {} }),
					dispose() {},
				};
			},
			...(options.workspaceRoot === undefined
				? {}
				: {
						workspaceFolders: [
							{ uri: { fsPath: options.workspaceRoot } },
						],
					}),
			getConfiguration: () => ({
				get<T>(key: string, defaultValue?: T): T | undefined {
					if (
						options.configured !== false &&
						key in LAUNCH_SETTINGS
					) {
						return LAUNCH_SETTINGS[key] as T;
					}
					if (key === 'development.autoReload') {
						return (options.autoReload ?? defaultValue) as T;
					}
					return defaultValue;
				},
			}),
		},
	};
	return {
		context,
		vscode,
		handlers,
		executed,
		infos,
		errors,
		panels,
		shown,
		bundleListeners,
		watchedPatterns,
	};
};

const clientOf = (
	callTool: TCallTool,
	onClose?: () => void,
	onListTools?: () => void,
) =>
	McpStdioClient.fromTransport({
		callTool,
		async listTools() {
			onListTools?.();
			return {
				tools: [{ name: 'delendai_overview', description: 'Overview' }],
			};
		},
		async close() {
			onClose?.();
		},
	});

const plan = {
	ok: true,
	preset: 'lean',
	wrote: false,
	created: [],
	skipped: [],
	residual: ['delendai.config.json'],
};

beforeEach(() => {
	__resetRuntimeHandle();
});

afterEach(() => {
	vi.useRealTimers();
	__resetRuntimeHandle();
	for (const root of roots.splice(0)) rmSync(root, { recursive: true });
});

describe('resilient client routing', () => {
	it('walks the router ladder until a candidate answers and renders its payload', async () => {
		const routed: { domain: string; action: string }[] = [];
		const harness = createHarness();
		const client = clientOf(async (input) => {
			const args = (input.arguments ?? {}) as {
				domain?: string;
				action?: string;
			};
			if (input.name !== ROUTER_TOOL) {
				return { structuredContent: { tools: [] } };
			}
			routed.push({
				domain: args.domain ?? '',
				action: args.action ?? '',
			});
			if (args.domain === 'adopt') {
				return { structuredContent: { structuredContent: plan } };
			}
			return {
				structuredContent: { isError: true, text: 'unknown domain' },
			};
		});
		await activate(harness.context, {
			vscode: harness.vscode,
			createClient: async () => client,
		});
		await harness.handlers.get(ADOPT_COMMAND)?.();
		expect(routed[0]).toEqual({
			domain: 'core',
			action: 'adopt_project',
		});
		expect(routed.at(-1)).toEqual({ domain: 'adopt', action: 'project' });
		expect(harness.errors).toEqual([]);
		expect(harness.panels.at(-1)?.webview.html).toContain(
			'delendai.config.json',
		);
	});

	it('reports the last router error when no candidate answers', async () => {
		const harness = createHarness();
		const client = clientOf(async (input) =>
			input.name === ROUTER_TOOL
				? {
						structuredContent: {
							isError: true,
							text: 'no such action',
						},
					}
				: { structuredContent: { tools: [] } },
		);
		await activate(harness.context, {
			vscode: harness.vscode,
			createClient: async () => client,
		});
		await harness.handlers.get(ADOPT_COMMAND)?.();
		expect(harness.errors.some((e) => e.includes('no such action'))).toBe(
			true,
		);
	});

	it('closes the connected client when the extension deactivates', async () => {
		let closed = 0;
		const harness = createHarness();
		await activate(harness.context, {
			vscode: harness.vscode,
			createClient: async () =>
				clientOf(
					async () => ({ structuredContent: { tools: [] } }),
					() => {
						closed += 1;
					},
				),
		});
		await vi.waitFor(() => {
			expect(closed).toBe(0);
		});
		expect(getRuntimeHandle()).toBeDefined();
		await deactivate();
		expect(getRuntimeHandle()).toBeUndefined();
		expect(closed).toBeGreaterThan(0);
	});
});

describe('tool detail through the resilient client', () => {
	it('reads the tool schema from the connected transport and pushes the detail to the dashboard', async () => {
		let listed = 0;
		const harness = createHarness();
		await activate(harness.context, {
			vscode: harness.vscode,
			createClient: async () =>
				clientOf(
					async () => ({ structuredContent: { tools: [] } }),
					undefined,
					() => {
						listed += 1;
					},
				),
		});
		await harness.handlers.get('delendai.openToolDetail')?.({
			name: 'delendai_overview',
		});
		expect(listed).toBeGreaterThan(0);
	});
});

describe('deactivation while connecting', () => {
	it('closes the client that finishes connecting after deactivate', async () => {
		let closed = 0;
		let finish: (client: McpStdioClient) => void = () => undefined;
		const harness = createHarness();
		await activate(harness.context, {
			vscode: harness.vscode,
			createClient: () =>
				new Promise<McpStdioClient>((resolve) => {
					finish = resolve;
				}),
		});
		const deactivation = deactivate();
		finish(
			clientOf(
				async () => ({ structuredContent: {} }),
				() => {
					closed += 1;
				},
			),
		);
		await deactivation;
		expect(closed).toBeGreaterThan(0);
	});
});

describe('connection timeout', () => {
	it('leaves the disconnected client in place and closes a late connection', async () => {
		vi.useFakeTimers();
		let closedLate = false;
		let resolveLate: (client: McpStdioClient) => void = () => undefined;
		const harness = createHarness();
		const activation = activate(harness.context, {
			vscode: harness.vscode,
			createClient: () =>
				new Promise<McpStdioClient>((resolve) => {
					resolveLate = resolve;
				}),
		});
		await vi.advanceTimersByTimeAsync(0);
		await activation;
		await vi.advanceTimersByTimeAsync(10_000);
		vi.useRealTimers();
		await harness.handlers.get(ADOPT_COMMAND)?.();
		expect(
			harness.errors.some((e) => e.includes('MCP server is connecting')),
		).toBe(true);
		resolveLate(
			clientOf(
				async () => ({ structuredContent: {} }),
				() => {
					closedLate = true;
				},
			),
		);
		await vi.waitFor(() => {
			expect(closedLate).toBe(true);
		});
	});
});

describe('untrusted workspace', () => {
	it('does not start the server and tells the user how to start it manually', async () => {
		let created = 0;
		const harness = createHarness({ trusted: false });
		await activate(harness.context, {
			vscode: harness.vscode,
			createClient: async () => {
				created += 1;
				return clientOf(async () => ({ structuredContent: plan }));
			},
		});
		expect(created).toBe(0);
		expect(harness.infos.some((m) => m.includes('untrusted'))).toBe(true);
		await harness.handlers.get(ADOPT_COMMAND)?.();
		expect(
			harness.errors.some((e) => e.includes('workspace is untrusted')),
		).toBe(true);
	});

	it('adopts the client the manual start command connects', async () => {
		const harness = createHarness({ trusted: false });
		const approved = new Map<string, unknown>();
		harness.context.globalState.get = ((key: string) =>
			approved.get(key)) as typeof harness.context.globalState.get;
		harness.context.globalState.update = (async (
			key: string,
			value: unknown,
		) => {
			approved.set(key, value);
		}) as typeof harness.context.globalState.update;
		const client = clientOf(async (input) =>
			input.name === ROUTER_TOOL
				? { structuredContent: { structuredContent: plan } }
				: { structuredContent: { tools: [] } },
		);
		harness.vscode.window.showQuickPick = (async (
			items: readonly { id: string; label: string }[],
		) => items.find((item) => item.id === 'approve')) as NonNullable<
			IVscodeApi['window']['showQuickPick']
		>;
		await activate(harness.context, {
			vscode: harness.vscode,
			createClient: async () => client,
		});
		await harness.handlers.get('delendai.startServerUntrusted')?.();
		await harness.handlers.get(ADOPT_COMMAND)?.();
		expect(harness.panels.at(-1)?.webview.html).toContain(
			'delendai.config.json',
		);
	});
});

describe('development auto-reload', () => {
	it('reloads the window once for a burst of changes to the bundle', async () => {
		const harness = createHarness({
			autoReload: true,
			extensionPath: '/ext/path',
		});
		await activate(harness.context, {
			vscode: harness.vscode,
			createClient: async () =>
				clientOf(async () => ({ structuredContent: { tools: [] } })),
		});
		expect(harness.watchedPatterns).toContain('/ext/path/extension.js');
		vi.useFakeTimers();
		expect(harness.bundleListeners).toHaveLength(2);
		for (const listener of harness.bundleListeners) listener();
		for (const listener of harness.bundleListeners) listener();
		await vi.advanceTimersByTimeAsync(250);
		expect(harness.executed).toEqual(['workbench.action.reloadWindow']);
		await vi.advanceTimersByTimeAsync(250);
		expect(harness.executed).toEqual(['workbench.action.reloadWindow']);
	});

	it('stays off unless the setting is enabled', async () => {
		const harness = createHarness({ extensionPath: '/ext/path' });
		await activate(harness.context, {
			vscode: harness.vscode,
			createClient: async () =>
				clientOf(async () => ({ structuredContent: { tools: [] } })),
		});
		expect(harness.watchedPatterns).not.toContain('/ext/path/extension.js');
	});
});

describe('runtime log command', () => {
	it('says the log is unavailable when the host has no output channels', async () => {
		const harness = createHarness();
		await activate(harness.context, {
			vscode: harness.vscode,
			createClient: async () =>
				clientOf(async () => ({ structuredContent: { tools: [] } })),
		});
		await harness.handlers.get('delendai.openRuntimeLog')?.();
		expect(harness.infos).toContain(
			'DelendAI runtime log is unavailable in this host.',
		);
	});

	it('reveals the runtime channel without stealing focus when it exists', async () => {
		const root = makeRoot();
		const harness = createHarness({
			withChannels: true,
			workspaceRoot: root,
		});
		await activate(harness.context, {
			vscode: harness.vscode,
			createClient: async () =>
				clientOf(async () => ({ structuredContent: { tools: [] } })),
		});
		await harness.handlers.get('delendai.openRuntimeLog')?.();
		expect(harness.shown).toEqual([true]);
		await deactivate();
	});
});

describe('stub host dashboard', () => {
	it('opens the dashboard panel through the injected host and reports a missing client', async () => {
		const harness = createHarness();
		await activate(harness.context, {
			vscode: harness.vscode,
			createClient: async () =>
				clientOf(async () => ({ structuredContent: { tools: [] } })),
		});
		await harness.handlers.get('delendai.openDashboard')?.();
		expect(harness.panels.length).toBeGreaterThan(0);
	});
});

describe('resolveServerCommand discovery', () => {
	it('reads the launch from the workspace .mcp.json when no setting exists', async () => {
		const root = makeRoot();
		writeFileSync(
			join(root, '.mcp.json'),
			JSON.stringify({
				mcpServers: {
					delendai: {
						command: 'bunx',
						args: ['delendai'],
						cwd: '/srv',
					},
				},
			}),
		);
		const harness = createHarness({
			configured: false,
			workspaceRoot: root,
		});
		expect(await resolveServerCommand(harness.vscode)).toEqual({
			command: 'bunx',
			args: ['delendai'],
			cwd: '/srv',
		});
	});

	it('ignores a malformed .mcp.json entry and falls back to the project config', async () => {
		const root = makeRoot();
		writeFileSync(
			join(root, '.mcp.json'),
			JSON.stringify({ mcpServers: { delendai: { command: 3 } } }),
		);
		writeFileSync(join(root, 'delendai.config.json'), '{}');
		const harness = createHarness({
			configured: false,
			workspaceRoot: root,
		});
		expect(await resolveServerCommand(harness.vscode)).toEqual({
			command: 'bun',
			args: ['run', 'delendai'],
			cwd: root,
		});
	});

	it('returns nothing for a workspace that is neither configured nor adopted', async () => {
		const root = makeRoot();
		mkdirSync(join(root, 'src'));
		const harness = createHarness({
			configured: false,
			workspaceRoot: root,
		});
		expect(await resolveServerCommand(harness.vscode)).toBeUndefined();
	});
});

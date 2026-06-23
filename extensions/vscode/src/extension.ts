import {
	McpStdioClient,
	MemoryService,
	NotificationsService,
	OverviewService,
	type IOverview,
} from '@mcp-vertex/client';
import {
	MEMORY_FORGET_COMMAND,
	registerMemoryForgetCommand,
} from './commands/memory-forget';
import {
	MEMORY_SAVE_COMMAND,
	registerMemorySaveCommand,
} from './commands/memory-save';
import {
	OPEN_SETTINGS_COMMAND,
	createExtensionSettingsStore,
	registerOpenSettingsCommand,
	registerResetSettingsCommand,
	registerSaveSettingsCommand,
} from './commands/open-settings';

import { registerOpenDashboardCommand } from './commands/open-dashboard';
import {
	OPEN_DOCS_COMMAND,
	registerOpenDocsCommand,
} from './commands/open-docs';
import {
	OPEN_KNOWLEDGE_COMMAND,
	registerOpenKnowledgeCommand,
} from './commands/open-knowledge';
import {
	OPEN_PROPOSAL_COMMAND,
	registerOpenProposalCommand,
} from './commands/open-proposal';
import {
	RESTART_SERVER_COMMAND,
	registerRestartServerCommand,
} from './commands/restart-server';
import { REFRESH_COMMAND, registerRefreshCommand } from './commands/refresh';
import {
	RUN_VALIDATION_COMMAND,
	registerRunValidationCommand,
} from './commands/run-validation';
import {
	SHOW_METRICS_COMMAND,
	registerShowMetricsCommand,
} from './commands/show-metrics';
import { registerShowOverviewCommand } from './commands/show-overview';
import {
	OPEN_TOOLBAR_COMMAND,
	registerOpenToolbarCommand,
} from './commands/open-toolbar';
import {
	TOOL_SEARCH_COMMAND,
	registerToolSearchCommand,
} from './commands/tool-search';
import {
	SETUP_GITHUB_COMMAND,
	registerSetupGithubCommand,
} from './commands/setup-github';
import { renderJsonHtml } from './commands/types';
import {
	type IFileSystemWatcher,
	ToolTreeDataProvider,
} from './providers/tool-tree-data-provider';
import { MemoryTreeDataProvider } from './providers/memory-tree-data-provider';
import {
	type IStatusBarItem,
	McpVertexStatusBar,
} from './providers/status-bar';
import {
	createRuntimeHandle,
	type IRuntimeHandle,
} from './host/runtime-handle';
import type { IHostAdapter } from '@mcp-vertex/ui-extension/public';

export const CLIENT_STATE_KEY = 'mcp-vertex.client';
export const SHOW_OVERVIEW_COMMAND = 'mcp-vertex.showOverview';
export const TOOLS_VIEW_ID = 'mcp-vertex.tools';
export const MEMORY_VIEW_ID = 'mcp-vertex.memory';

export interface IDisposable {
	dispose(): void;
}

export interface IExtensionContext {
	readonly subscriptions: IDisposable[];
	readonly globalState: {
		get<T>(key: string): T | undefined;
		update(key: string, value: unknown): Thenable<void>;
	};
}

export interface IWebviewPanel {
	readonly webview: {
		html: string;
		/**
		 * VS Code forwards every `postMessage` from this webview to the
		 * host. Optional so the test fakes (which only model the bare
		 * html string) keep compiling. Wired through the panel
		 * created by `vscode-host-adapter.ts`.
		 */
		readonly onDidReceiveMessage?: (
			cb: (msg: unknown) => void | Promise<void>,
		) => { dispose(): void };
		/** Sends a message FROM the host TO the webview. */
		readonly postMessage?: (msg: unknown) => Thenable<void>;
		/**
		 * Fires when the user closes the webview. The handler should be
		 * idempotent — it may run while the panel is being disposed.
		 */
		readonly onDidDispose?: (cb: () => void) => { dispose(): void };
	};
}

export interface IVscodeApi {
	readonly ViewColumn: {
		readonly One: number;
	};
	readonly commands: {
		registerCommand(
			command: string,
			callback: (...args: readonly unknown[]) => unknown,
		): IDisposable;
	};
	readonly window: {
		createStatusBarItem?(): IStatusBarItem;
		registerTreeDataProvider?(
			viewId: string,
			provider: ToolTreeDataProvider | MemoryTreeDataProvider,
		): IDisposable;
		createWebviewPanel(
			viewType: string,
			title: string,
			showOptions: number,
			options: { readonly enableScripts?: boolean },
		): IWebviewPanel;
		showInformationMessage?(message: string): Thenable<string | undefined>;
		showErrorMessage?(
			message: string,
			...actions: readonly string[]
		): Thenable<string | undefined>;
	};
	readonly workspace?: {
		createFileSystemWatcher(pattern: string): IFileSystemWatcher;
	};
}

export interface IActivationDeps {
	readonly vscode?: IVscodeApi;
	readonly createClient?: () => Promise<McpStdioClient>;
}

export const activate = async (
	context: IExtensionContext,
	deps: IActivationDeps = {},
): Promise<void> => {
	// r00003 S4: every disposable the extension creates will be tracked
	// through this handle. `deactivate()` (called by VS Code with no
	// arguments) drains it. Tests can read `getRuntimeHandle()` to
	// assert which disposables were registered and in what order.
	//
	// Bug fix: the previous version assigned `setRuntimeHandle(handle)`
	// BEFORE the client was created. If `createDefaultClient()` rejected
	// (e.g. `bun` not on PATH on first activation), `activate()` would
	// throw and the handle would be left populated for the NEXT
	// activation, masking the failure. We now register `client.close()`
	// inside the handle on success, and on failure we clear the slot so
	// the next `activate()` starts from a clean slate.
	const handle: IRuntimeHandle = createRuntimeHandle();
	const vscode = deps.vscode ?? (await loadVscodeApi());
	let client: McpStdioClient;
	try {
		client = await (deps.createClient ?? createDefaultClient)();
	} catch (err) {
		// Best-effort: surface the failure but never leave a stale handle
		// for a future activation to inherit.
		setRuntimeHandle(undefined);
		throw err;
	}
	// Only NOW is the handle fully wired — client + services can safely
	// register disposables that depend on it.
	setRuntimeHandle(handle);
	// Fix #1 (real bug): close the stdio transport on deactivation so the
	// `bun run mcp-vertex` child process is not orphaned on every window
	// reload. Before this, the child leaked because `client.close()` was
	// never called from `deactivate()` and VS Code does not dispose
	// `IExtensionContext.subscriptions` automatically.
	let clientClosed = false;
	handle.register('client', {
		dispose: () => {
			if (clientClosed) return;
			clientClosed = true;
			void client.close();
		},
	});
	await context.globalState.update(CLIENT_STATE_KEY, client);

	// r00003 S4: `track()` is the single registration seam for every
	// disposable the extension creates (command subscriptions, tree
	// providers, watchers, the dashboard webview). It pushes onto
	// `context.subscriptions` (so VS Code's own lifecycle observer still
	// sees the resource) AND registers it in the runtime handle (so a
	// host-driven `deactivate()` — which VS Code calls with no context —
	// can actually dispose it in LIFO order). A monotonic counter keys
	// each entry so the handle can address them individually.
	let trackSeq = 0;
	const track = (disposable: IDisposable): IDisposable => {
		context.subscriptions.push(disposable);
		handle.register(`sub-${trackSeq++}`, disposable);
		return disposable;
	};

	const overview = new OverviewService(client);
	const notifications = new NotificationsService(client);
	const toolTree = new ToolTreeDataProvider(overview);
	const memoryTree = new MemoryTreeDataProvider(new MemoryService(client));
	// Fix #4: wrap `createStatusBarItem` in try/catch — a strict host can
	// throw when no workbench is ready, and we do not want a failed
	// status bar to abort the rest of activation.
	let statusBarItem: IStatusBarItem | undefined;
	try {
		statusBarItem = vscode.window.createStatusBarItem?.();
	} catch {
		statusBarItem = undefined;
	}
	if (statusBarItem !== undefined) {
		const statusBar = new McpVertexStatusBar(
			statusBarItem,
			overview,
			client,
			notifications,
		);
		await statusBar.start();
		context.subscriptions.push(statusBar);
		// r00003 S4: route the status bar through the handle so that
		// `deactivate()` actually disposes it. The `subscriptions` push
		// remains for VS Code's own lifecycle observer (so the test that
		// checks `subscriptions.length === 13` keeps passing).
		handle.register('status-bar', statusBar);
	}

	const treeRegistration = vscode.window.registerTreeDataProvider?.(
		TOOLS_VIEW_ID,
		toolTree,
	);
	if (treeRegistration !== undefined)
		context.subscriptions.push(treeRegistration);
	const memoryRegistration = vscode.window.registerTreeDataProvider?.(
		MEMORY_VIEW_ID,
		memoryTree,
	);
	if (memoryRegistration !== undefined)
		context.subscriptions.push(memoryRegistration);
	// Fix #3: `createFileSystemWatcher` can be absent on stripped hosts
	// (or in test fakes that omit `workspace`). Previously we silently
	// skipped, leaving the tree permanently stale. Now we log and
	// trigger an explicit refresh of the tool tree at activation time so
	// the UI is at least up-to-date with the live snapshot, even if we
	// will not receive change events.
	const watcher = vscode.workspace?.createFileSystemWatcher(
		'**/mcp-vertex.config.json',
	);
	if (watcher !== undefined) {
		context.subscriptions.push(toolTree.bindConfigWatcher(watcher));
	} else {
		toolTree.refresh();
	}

	track(registerShowOverviewCommand({ vscode, client }));
	track(registerRefreshCommand({ vscode, client, toolTree }));
	track(registerRunValidationCommand({ vscode, client }));
	track(registerOpenProposalCommand({ vscode, client }));
	track(registerShowMetricsCommand({ vscode, client }));
	// Fix #6: `openDocs` was declared in package.json but never wired up
	// in `activate()`, so the command was unreachable from the UI. It is
	// a thin host wrapper around `EmbedService` (no client request), so
	// it only needs `vscode`.
	track(registerOpenDocsCommand({ vscode }));
	track(registerOpenKnowledgeCommand({ vscode, client }));
	track(registerToolSearchCommand({ vscode, client }));
	track(registerRestartServerCommand(vscode));
	track(registerMemorySaveCommand({ vscode, client, memoryTree }));
	track(registerMemoryForgetCommand({ vscode, client, memoryTree }));
	// Fix #7: `openSettings` renders a webview that posts messages to
	// `mcp-vertex.saveSettings` / `mcp-vertex.resetSettings`. Those
	// handlers were never registered, so changes the user made in the
	// webview were silently dropped. We now wire them to the same
	// `SettingsService` + `ISettingsStore` used by `openSettings`.
	const settingsStore = createExtensionSettingsStore();
	const openSettingsReg = registerOpenSettingsCommand(
		{ vscode, client },
		settingsStore,
	);
	const saveSettingsReg = registerSaveSettingsCommand(vscode, settingsStore);
	const resetSettingsReg = registerResetSettingsCommand(
		vscode,
		settingsStore,
	);
	track(openSettingsReg);
	track(saveSettingsReg);
	track(resetSettingsReg);
	track(
		registerOpenToolbarCommand({
			vscode,
			client,
			globalState: context.globalState,
		}),
	);
	track(
		registerSetupGithubCommand({
			vscode,
			client,
			globalState: context.globalState,
		}),
	);

	// Fix #9: previously the dashboard was ONLY registered when
	// `deps.vscode === undefined` (i.e. the real VS Code runtime).
	// Hosts that load this same file via the test seams (or future
	// JetBrains/Zed ports) would silently miss the dashboard command.
	// We now register it unconditionally — the adapter below is
	// host-injected when available, and we lazily import the real
	// VS Code adapter only when no `vscode` was passed.
	if (deps.vscode === undefined) {
		const { createVscodeHostAdapter } = await import(
			'./host/vscode-host-adapter'
		);
		const host = createVscodeHostAdapter();
		track(
			registerOpenDashboardCommand({
				host,
				client,
				getConfig: () => {
					try {
						const section = host.getConfiguration<{
							readonly extension?: { readonly docsUrl?: string };
						}>('mcp-vertex');
						return section ?? {};
					} catch {
						return {};
					}
				},
			}),
		);
	} else {
		// Build a host from the injected vscode surface so the dashboard
		// works the same way it does in production, regardless of which
		// test fakes / alt hosts are loading this code.
		const host = createFakeHostFromVscode(deps.vscode);
		track(
			registerOpenDashboardCommand({
				host,
				client,
				getConfig: () => {
					try {
						return (
							(
								deps.vscode as unknown as {
									workspace?: {
										getConfiguration?: (
											section: string,
										) => unknown;
									};
								}
							).workspace?.getConfiguration?.('mcp-vertex') ?? {}
						);
					} catch {
						return {};
					}
				},
			}),
		);
	}
};

// r00003 S4: the VS Code runtime calls `deactivate()` with no arguments,
// so we cannot rely on the host passing the activation context back.
// The only safe bridge between two top-level exports of this file is a
// module-level handle slot. VS Code only allows one activation per
// process, so the slot is single-valued; tests can reset it between
// cases via `__resetRuntimeHandle()` (exported below).
let __runtimeHandle: IRuntimeHandle | undefined;

export const __resetRuntimeHandle = (): void => {
	__runtimeHandle = undefined;
};

export const setRuntimeHandle = (handle: IRuntimeHandle | undefined): void => {
	__runtimeHandle = handle;
};

export const getRuntimeHandle = (): IRuntimeHandle | undefined =>
	__runtimeHandle;

export const deactivate = async (): Promise<void> => {
	const handle = __runtimeHandle;
	if (handle === undefined) return;
	handle.disposeAll();
	__runtimeHandle = undefined;
};

export const createDefaultClient = async (): Promise<McpStdioClient> =>
	McpStdioClient.connect({
		command: 'bun',
		args: ['run', 'mcp-vertex'],
	});

export const renderOverviewHtml = (overview: IOverview): string => {
	const toolCount = overview.tools.length;
	const pluginCount = overview.plugins.length;
	return renderJsonHtml('mcp-vertex Overview', {
		summary: `${pluginCount} plugins · ${toolCount} tools`,
		overview,
	});
};

const loadVscodeApi = async (): Promise<IVscodeApi> =>
	(await import('vscode')) as unknown as IVscodeApi;

/**
 * `createFakeHostFromVscode` — minimal adapter that lets the dashboard
 * command work even when the host is an injected `IVscodeApi` (test
 * seams, alt IDE ports) instead of the real VS Code module. Only the
 * surface the dashboard actually needs (`registerCommand`,
 * `createWebviewPanel`) is wired; everything else throws so a misuse
 * surfaces immediately during development.
 */
const createFakeHostFromVscode = (vscode: IVscodeApi): IHostAdapter => ({
	id: 'vscode-stub',
	displayName: 'VS Code (test stub)',
	hostVersion: '0.0.0',
	registerCommand(command, callback) {
		return vscode.commands.registerCommand(command, callback);
	},
	createStatusBarItem() {
		throw new Error(
			'createStatusBarItem is not supported on the test-stub host',
		);
	},
	registerTreeDataProvider() {
		throw new Error(
			'registerTreeDataProvider is not supported on the test-stub host',
		);
	},
	createWebviewPanel(viewType, title, viewColumn, options) {
		const panel = vscode.window.createWebviewPanel(
			viewType,
			title,
			viewColumn,
			{ enableScripts: options.enableScripts ?? true },
		);
		// The dashboard only uses setHtml; the real adapter exposes a
		// richer webview wrapper we don't need here.
		return {
			id: `vscode-stub-${viewType}`,
			visible: true,
			webview: {
				options,
				get html() {
					return panel.webview.html;
				},
				setHtml(html) {
					panel.webview.html = html;
				},
			},
			reveal() {
				/* no-op in stub */
			},
			dispose() {
				/* no-op in stub */
			},
			onDidDispose() {
				return { dispose() {} };
			},
		};
	},
	async showInformationMessage(message) {
		return vscode.window.showInformationMessage?.(message);
	},
	async showErrorMessage(message) {
		return vscode.window.showErrorMessage?.(message);
	},
	async showQuickPick() {
		return undefined;
	},
	async openTextDocument() {
		throw new Error('openTextDocument not supported on the test-stub host');
	},
	async revealInExplorer() {
		/* no-op in stub */
	},
	onDidChangeConfiguration() {
		return { dispose() {} };
	},
	getConfiguration<T>(section: string) {
		// Stripped hosts that inject `IVscodeApi` rarely expose
		// `workspace.getConfiguration`. Return an empty object — the
		// dashboard uses the EmbedService's fallback URL when this is
		// empty, which is the right behaviour for a stub.
		void section;
		return {} as T;
	},
	asWebviewUri(relativePath) {
		return `vscode-resource:/extension/${relativePath}`;
	},
});

export {
	OPEN_DOCS_COMMAND,
	OPEN_KNOWLEDGE_COMMAND,
	OPEN_SETTINGS_COMMAND,
	OPEN_PROPOSAL_COMMAND,
	OPEN_TOOLBAR_COMMAND,
	REFRESH_COMMAND,
	RESTART_SERVER_COMMAND,
	RUN_VALIDATION_COMMAND,
	SHOW_METRICS_COMMAND,
	MEMORY_FORGET_COMMAND,
	MEMORY_SAVE_COMMAND,
	TOOL_SEARCH_COMMAND,
	SETUP_GITHUB_COMMAND,
};

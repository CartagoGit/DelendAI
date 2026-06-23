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
	registerOpenSettingsCommand,
} from './commands/open-settings';

import { registerOpenDashboardCommand } from './commands/open-dashboard';
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
	const handle: IRuntimeHandle = createRuntimeHandle();
	setRuntimeHandle(handle);
	const vscode = deps.vscode ?? (await loadVscodeApi());
	const client = await (deps.createClient ?? createDefaultClient)();
	await context.globalState.update(CLIENT_STATE_KEY, client);
	const overview = new OverviewService(client);
	const notifications = new NotificationsService(client);
	const toolTree = new ToolTreeDataProvider(overview);
	const memoryTree = new MemoryTreeDataProvider(new MemoryService(client));
	const statusBarItem = vscode.window.createStatusBarItem?.();
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
	const watcher = vscode.workspace?.createFileSystemWatcher(
		'**/mcp-vertex.config.json',
	);
	if (watcher !== undefined) {
		context.subscriptions.push(toolTree.bindConfigWatcher(watcher));
	}

	context.subscriptions.push(registerShowOverviewCommand({ vscode, client }));
	context.subscriptions.push(
		registerRefreshCommand({ vscode, client, toolTree }),
	);
	context.subscriptions.push(
		registerRunValidationCommand({ vscode, client }),
	);
	context.subscriptions.push(registerOpenProposalCommand({ vscode, client }));
	context.subscriptions.push(registerShowMetricsCommand({ vscode, client }));
	context.subscriptions.push(
		registerOpenKnowledgeCommand({ vscode, client }),
	);
	context.subscriptions.push(registerToolSearchCommand({ vscode, client }));
	context.subscriptions.push(registerRestartServerCommand(vscode));
	context.subscriptions.push(
		registerMemorySaveCommand({ vscode, client, memoryTree }),
	);
	context.subscriptions.push(
		registerMemoryForgetCommand({ vscode, client, memoryTree }),
	);
	context.subscriptions.push(registerOpenSettingsCommand({ vscode, client }));
	context.subscriptions.push(
		registerOpenToolbarCommand({
			vscode,
			client,
			globalState: context.globalState,
		}),
	);
	context.subscriptions.push(
		registerSetupGithubCommand({
			vscode,
			client,
			globalState: context.globalState,
		}),
	);

	// f00022 — IDE-agnostic dashboard, lazy-loaded adapter so unit tests
	// that inject a fake `vscode` API never resolve the real `vscode`
	// module (unavailable outside the VS Code runtime).
	if (deps.vscode === undefined) {
		const { createVscodeHostAdapter } = await import(
			'./host/vscode-host-adapter'
		);
		const host = createVscodeHostAdapter();
		context.subscriptions.push(
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

export const setRuntimeHandle = (handle: IRuntimeHandle): void => {
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

export {
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

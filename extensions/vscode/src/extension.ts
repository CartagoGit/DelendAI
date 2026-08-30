import {
	AgentCatalogService,
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
import {
	LEGACY_SETTINGS_STATE_KEY,
	SETTINGS_STATE_KEY,
} from './contracts/constants/settings-state-key.constant';
import { registerOpenConfigurationCenterCommand } from './commands/open-configuration-center';

import {
	registerExternalMcpsAckCommand,
	surfaceExternalMcpsPendingAcks,
} from './commands/external-mcps-ack';
import { registerOpenDashboardCommand } from './commands/open-dashboard';
import { registerProviderActionCommands } from './commands/provider-actions';
import { registerPluginActivationCommand } from './commands/plugin-activation';
import { PLUGIN_ACTIVATION_COMMAND } from './contracts/constants/plugin-activation-command.constant';
import {
	OPEN_DOCS_COMMAND,
	registerOpenDocsCommand,
} from './commands/open-docs';
import { registerOpenDocsApiCommand } from './commands/open-docs-api';
import { registerOpenAgentCatalogCommand } from './commands/open-agent-catalog';
import { registerOpenAgentTimelineCommand } from './commands/open-agent-timeline';
import {
	OPEN_AUTO_AGENT_SELECTOR_COMMAND,
	registerOpenAutoAgentSelectorCommand,
} from './commands/open-auto-agent-selector';
import {
	OPEN_KNOWLEDGE_COMMAND,
	registerOpenKnowledgeCommand,
} from './commands/open-knowledge';
import {
	OPEN_PROPOSAL_COMMAND,
	registerOpenProposalCommand,
} from './commands/open-proposal';
import {
	registerProposalsCopyErrorCommand,
	registerProposalsRefreshCommand,
} from './commands/proposals-commands';
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
import { registerOpenToolDetailCommand } from './commands/open-tool-detail';
import { OPEN_TOOL_DETAIL_COMMAND } from './contracts/constants/open-tool-detail-command.constant';
import {
	SETUP_GITHUB_COMMAND,
	registerSetupGithubCommand,
} from './commands/setup-github';
import { renderJsonHtml } from './commands/types';
import type { ICommandVscodeApi } from './commands/types';
import { registerKpiDashboardProvider } from './providers/kpi-dashboard-provider';
import {
	type IFileSystemWatcher,
	ToolTreeDataProvider,
} from './providers/tool-tree-data-provider';
import { MemoryTreeDataProvider } from './providers/memory-tree-data-provider';
import { ProposalBoardProvider } from './providers/proposal-board-provider';
import { createProposalFilterStore } from './host/proposal-filter-store';
import { ProposalsSnapshotSource } from './lib/proposals-snapshot';
import {
	type IStatusBarItem,
	McpVertexStatusBar,
} from './providers/status-bar';
import {
	createRuntimeHandle,
	type IRuntimeHandle,
} from './host/runtime-handle';
import type { IHostAdapter } from '@mcp-vertex/ui-extension/public';

const runSafely = (task: Promise<unknown>): void => {
	void task.catch(() => undefined);
};

export const CLIENT_STATE_KEY = 'mcp-vertex.client';
export const SHOW_OVERVIEW_COMMAND = 'mcp-vertex.showOverview';
export const TOOLS_VIEW_ID = 'mcp-vertex.tools';
export const MEMORY_VIEW_ID = 'mcp-vertex.memory';
export const PROPOSALS_VIEW_ID = 'mcp-vertex.proposals';
export const KPI_VIEW_ID = 'mcp-vertex.kpis';
export { OPEN_TOOL_DETAIL_COMMAND };
export { OPEN_AUTO_AGENT_SELECTOR_COMMAND };

export interface IDisposable {
	dispose(): void;
}

export interface IExtensionContext {
	readonly extensionPath?: string;
	readonly subscriptions: IDisposable[];
	readonly globalState: {
		get<T>(key: string): T | undefined;
		update(key: string, value: unknown): Thenable<void>;
	};
}

export interface IWebviewPanel {
	/** Native VS Code panel lifecycle hook. */
	readonly onDidDispose?: (cb: () => void) => { dispose(): void };
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
		executeCommand?<T>(
			command: string,
			...args: readonly unknown[]
		): Thenable<T>;
	};
	readonly window: {
		readonly createTerminal?: NonNullable<
			ICommandVscodeApi['window']['createTerminal']
		>;
		readonly onDidChangeTerminalShellIntegration?: NonNullable<
			ICommandVscodeApi['window']['onDidChangeTerminalShellIntegration']
		>;
		readonly onDidEndTerminalShellExecution?: NonNullable<
			ICommandVscodeApi['window']['onDidEndTerminalShellExecution']
		>;
		createOutputChannel?(name: string): IOutputChannel;
		createStatusBarItem?(): IStatusBarItem;
		registerTreeDataProvider?(
			viewId: string,
			provider:
				| ToolTreeDataProvider
				| MemoryTreeDataProvider
				| ProposalBoardProvider,
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
		getConfiguration?(section: string): IConfiguration;
		readonly workspaceFolders?: ReadonlyArray<{
			readonly uri: { readonly fsPath: string };
		}>;
		/** x00072 SEC-001 S1: workspace trust flag from VS Code. */
		readonly isTrusted?: boolean;
	};
}

export interface IOutputChannel extends IDisposable {
	append(value: string): void;
}

/**
 * Minimal subset of `vscode.WorkspaceConfiguration` we actually read.
 * `get<T>(key, defaultValue)` returns the configured value or the
 * fallback. Hosts that do not expose a configuration surface can
 * omit `workspace.getConfiguration` entirely — the spawn resolver
 * then falls back to the bundled defaults (`bun run mcp-vertex`).
 */
export interface IConfiguration {
	get<T>(key: string): T | undefined;
	get<T>(key: string, defaultValue: T): T;
}

export interface IActivationDeps {
	readonly vscode?: IVscodeApi;
	createClient?: () => Promise<McpStdioClient>;
	/** x00072 SEC-001 S1: trust override for the manual start-server command. */
	readonly trustOverride?: boolean;
}

export const activate = async (
	context: IExtensionContext,
	deps: IActivationDeps = {},
): Promise<void> => {
	// S4: every disposable the extension creates will be tracked
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
	handle.register(
		'command:mcp-vertex.startServerUntrusted',
		vscode.commands.registerCommand(
			'mcp-vertex.startServerUntrusted',
			async () => {
				try {
					const { registerStartServerUntrusted } = await import(
						'./commands/start-server-untrusted'
					);
					await registerStartServerUntrusted(context, vscode, {
						...deps,
						trustOverride: true,
					});
				} catch (err) {
					await vscode.window.showErrorMessage?.(
						`MCP-Vertex: start-server failed: ${(err as Error).message}`,
					);
				}
			},
		),
	);
	// S2: resolve the host's tool-name namespace from
	// `mcp-vertex.server.prefix` once, and thread it into every service so
	// a `--prefix=acme` deployment calls `acme_*` tools instead of silently
	// failing. `undefined` keeps the default `mcp-vertex_` behaviour.
	const namespacePrefix = resolveNamespacePrefix(vscode);
	// SEC-001 S1: refuse to spawn the stdio child when the
	// workspace is not trusted. The UI/services still register so the user
	// can see the host; the manual `start-server` command bypasses the gate
	// via `deps.trustOverride`.
	const isTrusted =
		deps.trustOverride === true
			? true
			: (vscode.workspace?.isTrusted ?? true);
	if (!isTrusted) {
		await vscode.window.showInformationMessage?.(
			'MCP-Vertex: workspace is untrusted — child server NOT started. Run `MCP-Vertex: Start Server (Untrusted)` to start manually.',
		);
		setRuntimeHandle(handle);
		return;
	}
	const startupReportChannel =
		vscode.window.createOutputChannel?.('MCP Vertex');
	if (startupReportChannel !== undefined) {
		handle.register('startup-report-channel', startupReportChannel);
	}
	let client: McpStdioClient;
	try {
		client = await (
			deps.createClient ??
			(() => createDefaultClient(vscode, startupReportChannel))
		)();
	} catch (err) {
		// Best-effort: surface the failure but never leave a stale handle
		// for a future activation to inherit.
		setRuntimeHandle(undefined);
		handle.disposeAll();
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
			return client.close();
		},
	});
	void Promise.resolve(
		context.globalState.update(CLIENT_STATE_KEY, client),
	).catch(() => {
		// Persistence is auxiliary; the live client remains usable when the
		// host cannot write global state during startup.
	});

	// S4: `track()` is the single registration seam for every
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
	// Register network-backed commands before the initial overview/status-bar
	// refresh. A slow or unavailable MCP server must not leave manifest
	// commands visible but unregistered in the workbench.
	for (const reg of registerProviderActionCommands({
		vscode,
		client,
		globalState: context.globalState,
		...(namespacePrefix === undefined ? {} : { namespacePrefix }),
	})) {
		track(reg);
	}
	registerDevelopmentAutoReload(context, vscode, track);

	const overview = new OverviewService(client, namespacePrefix);
	const catalog = new AgentCatalogService(
		client,
		namespacePrefix === undefined ? {} : { namespacePrefix },
	);
	const notifications = new NotificationsService(client, namespacePrefix);
	const toolTree = new ToolTreeDataProvider(overview, catalog);
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

	const treeRegistration = vscode.window.registerTreeDataProvider?.(
		TOOLS_VIEW_ID,
		toolTree,
	);
	if (treeRegistration !== undefined) track(treeRegistration);
	const memoryRegistration = vscode.window.registerTreeDataProvider?.(
		MEMORY_VIEW_ID,
		memoryTree,
	);
	if (memoryRegistration !== undefined) track(memoryRegistration);
	// Register views before the first status-bar refresh. The refresh performs
	// several MCP requests and must not prevent the workbench from attaching
	// the providers declared by the extension manifest.
	const proposalsSource = new ProposalsSnapshotSource({
		client,
		...(namespacePrefix === undefined ? {} : { namespacePrefix }),
	});
	const proposalsTree = new ProposalBoardProvider(client, {
		snapshotSource: proposalsSource,
		filterStore: createProposalFilterStore(context.globalState),
	});
	const proposalsRegistration = vscode.window.registerTreeDataProvider?.(
		PROPOSALS_VIEW_ID,
		proposalsTree,
	);
	if (proposalsRegistration !== undefined) track(proposalsRegistration);

	// S3: capture the host's actually-loaded plugin set after the views are
	// registered. A slow MCP overview must not prevent the workbench from
	// attaching the providers declared by the extension manifest.
	let loadedPlugins: readonly string[] | undefined;
	void overview
		.getOverview({ compact: true })
		.then((snap) => {
			const raw = (snap as { plugins?: unknown })?.plugins;
			if (Array.isArray(raw)) {
				loadedPlugins = raw.filter(
					(entry): entry is string =>
						typeof entry === 'string' && entry.length > 0,
				);
			}
		})
		.catch(() => {
			loadedPlugins = undefined;
		});

	if (statusBarItem !== undefined) {
		const statusBar = new McpVertexStatusBar(
			statusBarItem,
			overview,
			client,
			notifications,
			undefined,
			undefined,
			namespacePrefix,
		);
		runSafely(
			statusBar.start().catch(() => {
				statusBar.dispose();
			}),
		);
		context.subscriptions.push(statusBar);
		// S4: route the status bar through the handle so that
		// `deactivate()` actually disposes it. The `subscriptions` push
		// remains for VS Code's own lifecycle observer (so the test that
		// checks `subscriptions.length === 13` keeps passing).
		handle.register('status-bar', statusBar);
	}

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
		track(toolTree.bindConfigWatcher(watcher));
	} else {
		toolTree.refresh();
	}

	const withPrefix = namespacePrefix === undefined ? {} : { namespacePrefix };
	track(registerShowOverviewCommand({ vscode, client, ...withPrefix }));
	track(registerRefreshCommand({ vscode, client, toolTree, proposalsTree }));
	track(registerRunValidationCommand({ vscode, client }));
	track(
		registerOpenProposalCommand({
			vscode,
			client,
			proposalsSource,
			...withPrefix,
		}),
	);
	// S4: the board's own refresh (also on the view title bar) and the
	// banner's "Copy error" action.
	track(registerProposalsRefreshCommand({ vscode, client, proposalsTree }));
	track(registerProposalsCopyErrorCommand({ vscode, client }));
	track(registerShowMetricsCommand({ vscode, client }));
	// Fix #6: `openDocs` was declared in package.json but never wired up
	// in `activate()`, so the command was unreachable from the UI. It is
	// a thin host wrapper around `EmbedService` (no client request), so
	// it only needs `vscode`.
	track(registerOpenDocsCommand({ vscode }));
	// S6: surface the canonical docs/how-to-use/API from the IDE.
	track(registerOpenDocsApiCommand({ vscode }));
	track(registerOpenAgentCatalogCommand({ vscode, client }));
	// S1: VSCode Agent Timeline view. Reads
	// `.vscode/mcp-vertex/timeline.json` (written by the core
	// `TimelineBuffer`) and renders a vertical timeline of
	// claim/activate/change/test/cost/commit/close events.
	track(
		registerOpenAgentTimelineCommand({
			vscode,
			workspaceRoot:
				vscode.workspace?.workspaceFolders?.[0]?.uri.fsPath ?? null,
		}),
	);
	// S6: surface the auto-agent-selector plugin's roster +
	// recommendation so the user can review (and pin via the CLI /
	// configuration-center) without leaving the IDE.
	track(
		registerOpenAutoAgentSelectorCommand({ vscode, client, ...withPrefix }),
	);
	track(
		registerOpenConfigurationCenterCommand({
			vscode,
			client,
			globalState: context.globalState,
			...withPrefix,
		}),
	);
	track(registerOpenToolDetailCommand({ vscode, client, ...withPrefix }));
	track(registerOpenKnowledgeCommand({ vscode, client }));
	track(registerToolSearchCommand({ vscode, client, ...withPrefix }));
	track(registerRestartServerCommand(vscode));
	track(
		registerPluginActivationCommand({
			vscode,
			client,
			globalState: context.globalState,
			...withPrefix,
		}),
	);
	track(registerMemorySaveCommand({ vscode, client, memoryTree }));
	track(registerMemoryForgetCommand({ vscode, client, memoryTree }));
	// S5: external-server activation ack surface (gate decision 5).
	// The command lists pending acks → QuickPick → accept/reject via the
	// external_mcp_ack tool; a NON-MODAL toast surfaces them at activation.
	const externalMcpsAckDeps = {
		vscode,
		client,
		globalState: context.globalState,
		...withPrefix,
	};
	track(registerExternalMcpsAckCommand(externalMcpsAckDeps));
	runSafely(surfaceExternalMcpsPendingAcks(externalMcpsAckDeps));
	// Fix #7: `openSettings` renders a webview that posts messages to
	// `mcp-vertex.saveSettings` / `mcp-vertex.resetSettings`. Those
	// handlers were never registered, so changes the user made in the
	// webview were silently dropped. We now wire them to the same
	// `SettingsService` + `ISettingsStore` used by `openSettings`.
	// S3 (H4): back the settings store with
	// `context.globalState` so the user's choices survive a window
	// reload instead of living in module-scope memory.
	const settingsStore = createExtensionSettingsStore(context.globalState);
	const openSettingsReg = registerOpenSettingsCommand(
		{ vscode, client, globalState: context.globalState },
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
			...(loadedPlugins !== undefined ? { loadedPlugins } : {}),
			...withPrefix,
		}),
	);
	track(
		registerSetupGithubCommand({
			vscode,
			client,
			globalState: context.globalState,
		}),
	);

	runSafely(
		registerDashboardSurfaces(
			context,
			client,
			vscode,
			deps.vscode,
			namespacePrefix,
			track,
		),
	);
};

// S4: the VS Code runtime calls `deactivate()` with no arguments,
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
	await handle.disposeAll();
	__runtimeHandle = undefined;
};

/**
 * Resolve the server launch, in precedence order (x00102 S1):
 *
 *   1. Explicit `mcp-vertex.server.command` / `mcp-vertex.server.args`
 *      workspace settings — the operator always wins.
 *   2. The workspace's checked-in `.mcp.json` `mcpServers.mcp-vertex`
 *      entry — the file `mcpv init` writes, so a freshly-initialised
 *      consumer connects with zero extra configuration (before this,
 *      the default assumed a `"mcp-vertex"` package.json script that
 *      init never creates, and the extension died on connect).
 *   3. `bun run mcp-vertex` — the legacy fallback for workspaces that
 *      wire the server through a package.json script.
 *
 * `args` in the settings accept either a JSON array (typed verbatim in
 * settings.json) or a space-separated string — the latter is friendlier
 * for the common single-script case while still letting power users
 * pass flags via `["run", "mcp-vertex", "--preset=swarm"]`.
 */
export const resolveServerCommand = async (
	vscode: IVscodeApi,
): Promise<{ command: string; args: readonly string[]; cwd?: string }> => {
	const defaults = { command: 'bun', args: ['run', 'mcp-vertex'] } as const;
	const root = vscode.workspace?.workspaceFolders?.[0]?.uri.fsPath;
	const config = vscode.workspace?.getConfiguration?.('mcp-vertex.server');
	const command = config?.get<string>('command');
	const rawArgs = config?.get<unknown>('args');
	const configCwd = config?.get<string>('cwd');
	const args =
		Array.isArray(rawArgs) && rawArgs.every((a) => typeof a === 'string')
			? (rawArgs as readonly string[])
			: typeof rawArgs === 'string' && rawArgs.trim().length > 0
				? rawArgs.trim().split(/\s+/)
				: undefined;
	const cwd =
		typeof configCwd === 'string' && configCwd.trim().length > 0
			? configCwd.trim()
			: root;
	if (
		(typeof command === 'string' && command.length > 0) ||
		args !== undefined
	) {
		return {
			command: command ?? defaults.command,
			args: args ?? defaults.args,
			...(cwd === undefined ? {} : { cwd }),
		};
	}
	const fromMcpJson =
		root === undefined ? undefined : await readWorkspaceMcpJsonLaunch(root);
	if (fromMcpJson !== undefined) {
		return { ...fromMcpJson, ...(cwd === undefined ? {} : { cwd }) };
	}
	return {
		...defaults,
		...(cwd === undefined ? {} : { cwd }),
	};
};

/**
 * Read the `mcpServers.mcp-vertex` launch from `<workspace>/.mcp.json`.
 * Relative args in that file (e.g. the repo-local host script) resolve
 * against the workspace root, so the caller must spawn with `cwd: root`.
 */
const readWorkspaceMcpJsonLaunch = async (
	root: string,
): Promise<{ command: string; args: readonly string[] } | undefined> => {
	try {
		const { readFile } = await import('node:fs/promises');
		const { join } = await import('node:path');
		const raw = await readFile(join(root, '.mcp.json'), 'utf8');
		const parsed = JSON.parse(raw) as {
			readonly mcpServers?: Readonly<
				Record<
					string,
					{ readonly command?: unknown; readonly args?: unknown }
				>
			>;
		};
		const entry = parsed.mcpServers?.['mcp-vertex'];
		if (
			entry !== undefined &&
			typeof entry.command === 'string' &&
			entry.command.length > 0 &&
			Array.isArray(entry.args) &&
			entry.args.every((a) => typeof a === 'string')
		) {
			return { command: entry.command, args: entry.args as string[] };
		}
	} catch {
		// Missing or malformed .mcp.json → fall through to the default.
	}
	return undefined;
};

/**
 * Read `mcp-vertex.server.prefix` from the workspace configuration
 * (f00081 S2). This is the host's tool-name namespace — the same value
 * passed to the server's `--prefix` flag. When unset, the services fall
 * back to the default `mcp-vertex_` prefix, so existing deployments are
 * unaffected. Returns `undefined` (not the literal default) so each
 * service applies its own `prefix ?? 'mcp-vertex_'` default.
 */
export const resolveNamespacePrefix = (
	vscode: IVscodeApi,
): string | undefined => {
	const config = vscode.workspace?.getConfiguration?.('mcp-vertex.server');
	const prefix = config?.get<string>('prefix');
	return typeof prefix === 'string' && prefix.trim().length > 0
		? prefix.trim()
		: undefined;
};

export const createDefaultClient = async (
	vscode?: IVscodeApi,
	startupReportChannel?: IOutputChannel,
): Promise<McpStdioClient> => {
	const api = vscode ?? (await loadVscodeApi());
	const { command, args, cwd } = await resolveServerCommand(api);
	return McpStdioClient.connect({
		command,
		args,
		...(cwd === undefined ? {} : { cwd }),
		...(startupReportChannel === undefined
			? {}
			: {
					onStderr: (chunk: string) =>
						startupReportChannel.append(chunk),
				}),
	});
};

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

const registerDevelopmentAutoReload = (
	context: IExtensionContext,
	vscode: IVscodeApi,
	track: (disposable: IDisposable) => IDisposable,
): void => {
	const enabled = vscode.workspace
		?.getConfiguration?.('mcp-vertex')
		?.get<boolean>('development.autoReload', false);
	const extensionPath = context.extensionPath;
	if (enabled !== true || extensionPath === undefined) return;
	const watcher = vscode.workspace?.createFileSystemWatcher(
		`${extensionPath}/dist/extension.js`,
	);
	if (watcher === undefined || vscode.commands.executeCommand === undefined)
		return;
	let reloadScheduled = false;
	const reload = (): void => {
		if (reloadScheduled) return;
		reloadScheduled = true;
		setTimeout(() => {
			runSafely(
				Promise.resolve(
					vscode.commands?.executeCommand?.(
						'workbench.action.reloadWindow',
					),
				),
			);
		}, 250);
	};
	track({ dispose: () => undefined });
	track(watcher.onDidChange(reload));
	track(watcher.onDidCreate(reload));
};

const registerDashboardSurfaces = async (
	context: IExtensionContext,
	client: McpStdioClient,
	vscode: IVscodeApi,
	injectedVscode: IVscodeApi | undefined,
	namespacePrefix: string | undefined,
	track: (disposable: IDisposable) => IDisposable,
): Promise<void> => {
	const host =
		injectedVscode === undefined
			? await (async () => {
					const { createVscodeHostAdapter } = await import(
						'./host/vscode-host-adapter'
					);
					return createVscodeHostAdapter();
				})()
			: createFakeHostFromVscode(injectedVscode);
	track(
		registerOpenDashboardCommand({
			host,
			client,
			globalState: context.globalState,
			...(namespacePrefix === undefined ? {} : { namespacePrefix }),
			getConfig: () =>
				context.globalState.get(SETTINGS_STATE_KEY) ??
				context.globalState.get(LEGACY_SETTINGS_STATE_KEY) ??
				{},
		}),
	);
	const kpiRegistration = registerKpiDashboardProvider({
		host,
		client,
		viewId: KPI_VIEW_ID,
		...(namespacePrefix === undefined ? {} : { namespacePrefix }),
	});
	if (kpiRegistration !== undefined) track(kpiRegistration);
	void vscode;
};

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
	registerWebviewViewProvider() {
		return { dispose() {} };
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
	PLUGIN_ACTIVATION_COMMAND,
	SETUP_GITHUB_COMMAND,
};

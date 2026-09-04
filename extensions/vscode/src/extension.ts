// MUST be the first import — see the file header for the rationale.
// The named import keeps the shim module alive in Bun's tree-shaker
// (which would otherwise elide a side-effect-only import).
import { NAVIGATOR_PATCH_MARKER } from './shims/node22-navigator';
void NAVIGATOR_PATCH_MARKER;
import {
	AgentCatalogService,
	McpStdioClient,
	MemoryService,
	NotificationsService,
	OverviewService,
	type IOverview,
} from '@delendai/client';
import { join } from 'node:path';
import { readFile } from 'node:fs/promises';
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
import { registerOpenPluginConfigCommand } from './commands/open-plugin-config';

import { registerExternalMcpsAckCommand } from './commands/external-mcps-ack';
import { registerOpenDashboardCommand } from './commands/open-dashboard';
import { DashboardWebviewViewProvider } from './providers/dashboard-webview-view-provider';
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
import { type IStatusBarItem, DelendaiStatusBar } from './providers/status-bar';
import {
	createRuntimeHandle,
	type IRuntimeHandle,
} from './host/runtime-handle';
import type { IHostAdapter } from '@delendai/ui-extension/public';
import {
	RuntimeObserver,
	observerIntervalMs,
} from './observability/runtime-observer';

const runSafely = (task: Promise<unknown>): void => {
	void task.catch(() => undefined);
};

const CONNECT_TIMEOUT_MS = 10_000;

const connectWithTimeout = async (
	connect: () => Promise<McpStdioClient>,
): Promise<McpStdioClient> => {
	let timedOut = false;
	let timer: ReturnType<typeof setTimeout> | undefined;
	const attempt = Promise.resolve().then(connect);
	const lateCleanup = attempt.then(
		(client) => {
			if (timedOut) runSafely(client.close());
			return client;
		},
		() => undefined,
	);
	try {
		return await Promise.race([
			attempt,
			new Promise<McpStdioClient>((_, reject) => {
				timer = setTimeout(() => {
					timedOut = true;
					reject(
						new Error(
							`MCP server connection timed out after ${CONNECT_TIMEOUT_MS}ms`,
						),
					);
				}, CONNECT_TIMEOUT_MS);
			}),
		]);
	} finally {
		if (timer !== undefined) clearTimeout(timer);
		void lateCleanup;
	}
};

export const CLIENT_STATE_KEY = 'delendai.client';
export const SHOW_OVERVIEW_COMMAND = 'delendai.showOverview';
export const TOOLS_VIEW_ID = 'delendai.tools';
export const MEMORY_VIEW_ID = 'delendai.memory';
export const PROPOSALS_VIEW_ID = 'delendai.proposals';
export const KPI_VIEW_ID = 'delendai.kpis';
export const DASHBOARD_VIEW_ID = 'delendai.dashboard';
export const OPEN_RUNTIME_LOG_COMMAND = 'delendai.openRuntimeLog';
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
		showQuickPick?(
			items: ReadonlyArray<{
				readonly id: string;
				readonly label: string;
				readonly description?: string;
				readonly detail?: string;
			}>,
		): Thenable<
			| {
					readonly id: string;
					readonly label: string;
					readonly description?: string;
					readonly detail?: string;
			  }
			| undefined
		>;
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
	show?(preserveFocus?: boolean): void;
}

/**
 * Minimal subset of `vscode.WorkspaceConfiguration` we actually read.
 * The extension never invents a server command when these settings are
 * absent; hosts without a configuration surface remain disconnected.
 */
export interface IConfiguration {
	get<T>(key: string): T | undefined;
	get<T>(key: string, defaultValue: T): T;
}

export interface IActivationDeps {
	readonly vscode?: IVscodeApi;
	createClient?: () => Promise<McpStdioClient>;
	onClientConnected?: (client: McpStdioClient) => Promise<void> | void;
	/** x00072 SEC-001 S1: trust override for the manual start-server command. */
	readonly trustOverride?: boolean;
}

interface IResilientClient {
	readonly client: McpStdioClient;
	reconnect(): Promise<void>;
	replace(next: McpStdioClient): Promise<void>;
}

const createResilientClient = (
	initial: McpStdioClient,
	connect: () => Promise<McpStdioClient>,
	namespacePrefix?: string,
): IResilientClient => {
	let current = initial;
	let reconnecting: Promise<void> | undefined;
	let pendingConnection: Promise<McpStdioClient> | undefined;
	let ready: Promise<void> = Promise.resolve();
	const proxy = McpStdioClient.fromTransport({
		async callTool(input) {
			await ready;
			const directTools = new Set([
				'overview',
				'tool_search',
				'plugin_activate',
				'plugin_deactivate',
				'status',
				'vertex',
			]);
			const prefix = namespacePrefix?.trim()
				? namespacePrefix.trim().replace(/_?$/, '_')
				: 'delendai_';
			const suffix = input.name.startsWith(prefix)
				? input.name.slice(prefix.length)
				: undefined;
			if (suffix !== undefined && !directTools.has(suffix)) {
				const router = `${prefix}vertex`;
				// Build a candidate ladder so calls like
				//   delendai_project_kpis      (single underscore)
				//   delendai_project_kpis_now  (two underscores)
				// all reach the right domain/action. The router stores
				// tools under `<prefix>_<plugin>_<stem>` where `<plugin>`
				// uses a hyphen (e.g. project-kpis). So:
				//   • `core` covers tools registered without a plugin.
				//   • `<hyphen-plug>` covers the canonical kebab plugin id.
				//   • For two-or-more underscores, also try splitting the
				//     rightmost `_` (e.g. `kpis_history`).
				const candidates: Array<{
					readonly domain: string;
					readonly action: string;
				}> = [{ domain: 'core', action: suffix }];
				const firstSeparator = suffix.indexOf('_');
				if (firstSeparator !== -1) {
					const left = suffix.slice(0, firstSeparator);
					const right = suffix.slice(firstSeparator + 1);
					candidates.push(
						{ domain: left, action: right },
						{ domain: left.replaceAll('-', '_'), action: right },
						{ domain: `${left}-plugin`, action: right },
						// The kebab-plugin id with the FULL action — matches
						// tools like `project-kpis.project_kpis` whose plugin
						// name has a hyphen and the underscore lives inside
						// the tool stem.
						{ domain: left.replaceAll('_', '-'), action: suffix },
					);
					const lastSeparator = suffix.lastIndexOf('_');
					if (lastSeparator !== firstSeparator) {
						candidates.push({
							domain: suffix.slice(0, lastSeparator),
							action: suffix.slice(lastSeparator + 1),
						});
					}
				}
				const seen = new Set<string>();
				const ladder = candidates.filter((c) => {
					const key = `${c.domain}::${c.action}`;
					if (seen.has(key)) return false;
					seen.add(key);
					return true;
				});
				for (const candidate of ladder) {
					try {
						const routed = await current.request<
							{
								readonly domain: string;
								readonly action: string;
								readonly args: Readonly<
									Record<string, unknown>
								>;
							},
							{
								readonly routed?: boolean;
								readonly isError?: boolean;
								readonly text?: string;
								readonly structuredContent?: unknown;
							}
						>(router, {
							domain: candidate.domain,
							action: candidate.action,
							args: (input.arguments ?? {}) as Readonly<
								Record<string, unknown>
							>,
						});
						if (routed.isError === true) {
							throw new Error(
								routed.text ??
									`MCP tool "${input.name}" returned an error`,
							);
						}
						if (routed.structuredContent !== undefined) {
							return {
								structuredContent: routed.structuredContent,
							};
						}
						return { structuredContent: routed };
					} catch (error) {
						if (candidate === ladder[ladder.length - 1]) {
							throw error;
						}
					}
				}
			}
			return {
				structuredContent: await current.request(
					input.name,
					input.arguments ?? {},
				),
			};
		},
		async listTools() {
			await ready;
			return { tools: await current.listTools() };
		},
		async close() {
			if (pendingConnection !== undefined) {
				await pendingConnection
					.then((next) => next.close())
					.catch(() => undefined);
			}
			if (reconnecting !== undefined) {
				await reconnecting.catch(() => undefined);
			}
			await current.close();
		},
	});
	return {
		client: proxy,
		reconnect: async () => {
			if (reconnecting !== undefined) {
				const activeReconnect = reconnecting;
				try {
					await activeReconnect;
					return;
				} catch {
					if (reconnecting === activeReconnect) {
						reconnecting = undefined;
					}
				}
			}
			const connection = Promise.resolve().then(connect);
			pendingConnection = connection;
			ready = connection.then(
				() => undefined,
				() => undefined,
			);
			const operation = connection.then(async (next) => {
				const previous = current;
				current = next;
				await previous.close();
			});
			reconnecting = operation;
			const cleanup = (): void => {
				pendingConnection = undefined;
				if (reconnecting === operation) reconnecting = undefined;
			};
			void operation.then(cleanup, cleanup);
			void operation.catch(() => undefined);
			await operation;
		},
		replace: async (next) => {
			const previous = current;
			current = next;
			ready = Promise.resolve();
			if (previous !== next) await previous.close();
		},
	};
};

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
	const vscode = deps.vscode ?? loadVscodeApi();
	let adoptConnectedClient:
		| ((client: McpStdioClient) => Promise<void>)
		| undefined;
	handle.register(
		'command:delendai.startServerUntrusted',
		vscode.commands.registerCommand(
			'delendai.startServerUntrusted',
			async () => {
				try {
					const { registerStartServerUntrusted } = await import(
						'./commands/start-server-untrusted'
					);
					await registerStartServerUntrusted(context, vscode, {
						...deps,
						trustOverride: true,
						onClientConnected: async (next) => {
							await adoptConnectedClient?.(next);
						},
					});
				} catch (err) {
					await vscode.window.showErrorMessage?.(
						`DelendAI: start-server failed: ${(err as Error).message}`,
					);
				}
			},
		),
	);
	// S2: resolve the host's tool-name namespace from
	// `delendai.server.prefix` once, and thread it into every service so
	// a `--prefix=acme` deployment calls `acme_*` tools instead of silently
	// failing. `undefined` keeps the default `delendai_` behaviour.
	const namespacePrefix = resolveNamespacePrefix(vscode);
	// SEC-001 S1: refuse to spawn the stdio child when the
	// workspace is not trusted. The UI/services still register so the user
	// can see the host; the manual `start-server` command bypasses the gate
	// via `deps.trustOverride`.
	const isTrusted =
		deps.trustOverride === true
			? true
			: (vscode.workspace?.isTrusted ?? true);
	const startupReportChannel =
		vscode.window.createOutputChannel?.('DelendAI');
	if (startupReportChannel !== undefined) {
		handle.register('startup-report-channel', startupReportChannel);
	}
	const runtimeChannel =
		vscode.window.createOutputChannel?.('DelendAI Runtime');
	if (runtimeChannel !== undefined) {
		handle.register('runtime-channel', runtimeChannel);
	}
	const configuredLaunch = await resolveServerCommand(vscode);
	let initialClient: McpStdioClient;
	const disconnectedClient = (failure: Error): McpStdioClient =>
		McpStdioClient.fromTransport({
			async callTool() {
				throw failure;
			},
			async listTools() {
				throw failure;
			},
			async close() {},
		});
	const connectClient = (): Promise<McpStdioClient> =>
		connectWithTimeout(() =>
			(
				deps.createClient ??
				(() => createDefaultClient(vscode, startupReportChannel))
			)(),
		);
	if (!isTrusted) {
		initialClient = disconnectedClient(
			new Error('workspace is untrusted; MCP server was not started'),
		);
		runSafely(
			Promise.resolve(
				vscode.window.showInformationMessage?.(
					'DelendAI: workspace is untrusted — child server NOT started. Run `DelendAI: Start Server (Untrusted)` to start manually.',
				),
			),
		);
	} else {
		initialClient = disconnectedClient(
			configuredLaunch === undefined
				? new Error(
						'No MCP server launch is configured for the delendai extension',
					)
				: new Error('MCP server is connecting'),
		);
	}
	const resilient = createResilientClient(
		initialClient,
		connectClient,
		resolveNamespacePrefix(vscode),
	);
	adoptConnectedClient = resilient.replace;
	const client = resilient.client;
	const reconnect = resilient.reconnect;
	if (isTrusted && configuredLaunch !== undefined) {
		void reconnect()
			.then(
				() => undefined,
				() => undefined,
			)
			.catch(() => undefined);
	}
	void Promise.resolve(
		context.globalState.update(CLIENT_STATE_KEY, client),
	).catch(() => {
		// Persistence is auxiliary; the live client remains usable when the
		// host cannot write global state during startup.
	});
	// Only NOW is the handle fully wired — client + services can safely
	// register disposables that depend on it.
	setRuntimeHandle(handle);
	// Fix #1 (real bug): close the stdio transport on deactivation so the
	// `bun run delendai` child process is not orphaned on every window
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
	const serverConfigured = configuredLaunch !== undefined;
	const dashboardRefresh: {
		current?: DashboardWebviewViewProvider;
	} = {};
	// Register the dashboard before network-backed providers and commands.
	// The dashboard provider renders an unavailable state when MCP is down,
	// so activation can expose the web app without waiting for connectivity.
	const dashboardRegistration = registerDashboardSurfaces(
		context,
		client,
		vscode,
		deps.vscode,
		namespacePrefix,
		serverConfigured,
		track,
		dashboardRefresh,
	);
	await dashboardRegistration.catch(async (error: unknown) => {
		const message = error instanceof Error ? error.message : String(error);
		runtimeChannel?.append(`Dashboard registration failed: ${message}\n`);
		await vscode.window.showErrorMessage?.(
			`DelendAI dashboard could not be registered: ${message}`,
		);
	});
	if (runtimeChannel !== undefined) {
		const workspaceRoot =
			vscode.workspace?.workspaceFolders?.[0]?.uri.fsPath;
		if (workspaceRoot !== undefined) {
			const runtimeObserver = new RuntimeObserver(
				join(
					workspaceRoot,
					'.cache',
					'delendai',
					'runtime',
					'events.jsonl',
				),
				runtimeChannel,
				observerIntervalMs(vscode),
			);
			runtimeObserver.start();
			track(runtimeObserver);
		}
	}
	track(
		vscode.commands.registerCommand(OPEN_RUNTIME_LOG_COMMAND, () =>
			runtimeChannel === undefined
				? vscode.window.showInformationMessage?.(
						'DelendAI runtime log is unavailable in this host.',
					)
				: runtimeChannel.show?.(true),
		),
	);
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
	const toolTree = new ToolTreeDataProvider(
		overview,
		catalog,
		serverConfigured,
	);
	const memoryTree = new MemoryTreeDataProvider(
		new MemoryService(client),
		serverConfigured,
	);
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
		serverConfigured,
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
	if (statusBarItem !== undefined) {
		const statusBar = new DelendaiStatusBar(
			statusBarItem,
			overview,
			client,
			notifications,
			undefined,
			undefined,
			namespacePrefix,
		);
		try {
			statusBar.start();
		} catch {
			statusBar.dispose();
		}
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
	let watcher: IFileSystemWatcher | undefined;
	try {
		watcher = vscode.workspace?.createFileSystemWatcher?.(
			'**/delendai.config.json',
		);
	} catch {
		watcher = undefined;
	}
	if (watcher !== undefined) {
		track(toolTree.bindConfigWatcher(watcher));
	} else {
		toolTree.refresh();
	}

	const withPrefix = namespacePrefix === undefined ? {} : { namespacePrefix };
	// detailSink is wired below — see `dashboardProvider` construction —
	// because the dashboard provider depends on `host`, which is only
	// resolved after the MCP client connects. We expose a proxy so the
	// command registrations below can reference it before it has a
	// concrete implementation.
	const detailSink = ((kind, model) => {
		const provider = dashboardRefresh.current;
		return provider === undefined
			? Promise.resolve(false)
			: provider.getDetailBroker().push({ kind, model });
	}) as NonNullable<
		Parameters<typeof registerOpenToolDetailCommand>[0]['detailSink']
	>;
	track(registerShowOverviewCommand({ vscode, client, ...withPrefix }));
	track(
		registerRefreshCommand({
			vscode,
			client,
			toolTree,
			proposalsTree,
			memoryTree,
			dashboard: {
				refresh: () => dashboardRefresh.current?.refresh(),
			},
		}),
	);
	track(registerRunValidationCommand({ vscode, client }));
	track(
		registerOpenProposalCommand({
			vscode,
			client,
			proposalsSource,
			detailSink,
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
	// `.vscode/delendai/timeline.json` (written by the core
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
	// Right-click on a plugin in the Tools tree → open the
	// configuration center filtered by that plugin's id. The
	// configuration center is the schema-driven editor with
	// inputs / selects / checks for every plugin field; this
	// command gives the user the same editor with the deep-link
	// `pluginId` so they land on the right card.
	track(registerOpenPluginConfigCommand({ vscode, client, ...withPrefix }));
	track(
		registerOpenToolDetailCommand({
			vscode,
			client,
			detailSink,
			...withPrefix,
		}),
	);
	track(registerOpenKnowledgeCommand({ vscode, client }));
	track(registerToolSearchCommand({ vscode, client, ...withPrefix }));
	track(
		registerRestartServerCommand(vscode, {
			restartFn: reconnect,
		}),
	);
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
	// Fix #7: `openSettings` renders a webview that posts messages to
	// `delendai.saveSettings` / `delendai.resetSettings`. Those
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

/** Resolve only the explicit server launch configured for this extension. */
export const resolveServerCommand = async (
	vscode: IVscodeApi,
): Promise<
	{ command: string; args: readonly string[]; cwd?: string } | undefined
> => {
	const root = vscode.workspace?.workspaceFolders?.[0]?.uri.fsPath;
	const config = vscode.workspace?.getConfiguration?.('delendai.server');
	const command = config?.get<string>('command');
	const rawArgs = config?.get<unknown>('args');
	const configCwd = config?.get<string>('cwd');
	const explicitArgs =
		Array.isArray(rawArgs) && rawArgs.every((a) => typeof a === 'string')
			? (rawArgs as readonly string[])
			: typeof rawArgs === 'string' && rawArgs.trim().length > 0
				? rawArgs.trim().split(/\s+/)
				: undefined;
	let resolvedCommand = command;
	let args = explicitArgs;
	let resolvedCwd = configCwd;
	if (
		(typeof resolvedCommand !== 'string' ||
			resolvedCommand.trim().length === 0 ||
			args === undefined) &&
		root !== undefined
	) {
		const discovered = await readWorkspaceMcpLaunch(root);
		if (discovered !== undefined) {
			resolvedCommand = discovered.command;
			args = discovered.args;
			resolvedCwd = discovered.cwd;
		} else if (await hasProjectConfig(root)) {
			resolvedCommand = 'bun';
			args = ['run', 'delendai'];
		}
	}
	if (
		typeof resolvedCommand !== 'string' ||
		resolvedCommand.trim().length === 0 ||
		args === undefined
	)
		return undefined;
	const cwd =
		typeof resolvedCwd === 'string' && resolvedCwd.trim().length > 0
			? resolvedCwd.trim()
			: root;
	return {
		command: resolvedCommand.trim(),
		args,
		...(cwd === undefined ? {} : { cwd }),
	};
};

interface IWorkspaceMcpLaunch {
	readonly command: string;
	readonly args: readonly string[];
	readonly cwd?: string;
}

const readWorkspaceMcpLaunch = async (
	root: string,
): Promise<IWorkspaceMcpLaunch | undefined> => {
	try {
		const raw = JSON.parse(
			await readFile(join(root, '.mcp.json'), 'utf8'),
		) as {
			readonly mcpServers?: Record<string, unknown>;
			readonly servers?: Record<string, unknown>;
		};
		const entry = (raw.mcpServers ?? raw.servers)?.['delendai'];
		if (entry === null || typeof entry !== 'object') return undefined;
		const value = entry as {
			readonly command?: unknown;
			readonly args?: unknown;
			readonly cwd?: unknown;
		};
		if (
			typeof value.command !== 'string' ||
			!Array.isArray(value.args) ||
			!value.args.every((arg) => typeof arg === 'string')
		)
			return undefined;
		return {
			command: value.command,
			args: value.args,
			...(typeof value.cwd === 'string' ? { cwd: value.cwd } : {}),
		};
	} catch {
		return undefined;
	}
};

const hasProjectConfig = async (root: string): Promise<boolean> => {
	try {
		await readFile(join(root, 'delendai.config.json'), 'utf8');
		return true;
	} catch {
		return false;
	}
};

/**
 * Read `delendai.server.prefix` from the workspace configuration
 * (f00081 S2). This is the host's tool-name namespace — the same value
 * passed to the server's `--prefix` flag. When unset, the services fall
 * back to the default `delendai_` prefix, so existing deployments are
 * unaffected. Returns `undefined` (not the literal default) so each
 * service applies its own `prefix ?? 'delendai_'` default.
 */
export const resolveNamespacePrefix = (
	vscode: IVscodeApi,
): string | undefined => {
	const config = vscode.workspace?.getConfiguration?.('delendai.server');
	const prefix = config?.get<string>('prefix');
	return typeof prefix === 'string' && prefix.trim().length > 0
		? prefix.trim()
		: undefined;
};

export const createDefaultClient = async (
	vscode?: IVscodeApi,
	startupReportChannel?: IOutputChannel,
): Promise<McpStdioClient> => {
	const api = vscode ?? loadVscodeApi();
	const launch = await resolveServerCommand(api);
	if (launch === undefined) {
		throw new Error(
			'Configure delendai.server.command and delendai.server.args before starting the MCP server.',
		);
	}
	const { command, args, cwd } = launch;
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
	return renderJsonHtml('delendai Overview', {
		summary: `${pluginCount} plugins · ${toolCount} tools`,
		overview,
	});
};

/**
 * Resolve the `vscode` module. VS Code's Extension Host provides it
 * as a CommonJS namespace; a synchronous `require` is the portable
 * lookup (no async bootstrap, no wrapper that hides `default`).
 * The build script (`scripts/build.ts`) marks `vscode` as `external`
 * so the call lands on the host runtime export at activation time.
 */
// eslint-disable-next-line @typescript-eslint/no-var-requires
const loadVscodeApi = (): IVscodeApi =>
	require('vscode') as unknown as IVscodeApi;

const registerDevelopmentAutoReload = (
	context: IExtensionContext,
	vscode: IVscodeApi,
	track: (disposable: IDisposable) => IDisposable,
): void => {
	const enabled = vscode.workspace
		?.getConfiguration?.('delendai')
		?.get<boolean>('development.autoReload', false);
	const extensionPath = context.extensionPath;
	if (enabled !== true || extensionPath === undefined) return;
	let watcher: IFileSystemWatcher | undefined;
	try {
		watcher = vscode.workspace?.createFileSystemWatcher?.(
			`${extensionPath}/extension.js`,
		);
	} catch {
		watcher = undefined;
	}
	if (watcher === undefined || vscode.commands.executeCommand === undefined)
		return;
	let reloadScheduled = false;
	const reload = (): void => {
		if (reloadScheduled) return;
		reloadScheduled = true;
		setTimeout(() => {
			reloadScheduled = false;
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
	serverConfigured: boolean,
	track: (disposable: IDisposable) => IDisposable,
	dashboardRefresh: { current?: DashboardWebviewViewProvider },
): Promise<void> => {
	const withPrefix = namespacePrefix === undefined ? {} : { namespacePrefix };
	let host: IHostAdapter;
	if (injectedVscode !== undefined) {
		host = createFakeHostFromVscode(injectedVscode);
	} else {
		try {
			const { createVscodeHostAdapter } = await import(
				'./host/vscode-host-adapter'
			);
			host = createVscodeHostAdapter();
		} catch (error) {
			// Keep the canonical dashboard registrable even when an optional
			// host adapter import fails during extension-host startup.
			void vscode.window.showErrorMessage?.(
				`DelendAI host adapter unavailable: ${error instanceof Error ? error.message : String(error)}`,
			);
			host = createFakeHostFromVscode(vscode);
		}
	}
	const settingsStore = createExtensionSettingsStore(context.globalState);
	track(
		registerOpenDashboardCommand({
			host,
			client,
			globalState: context.globalState,
			settingsStore,
			...(namespacePrefix === undefined ? {} : { namespacePrefix }),
			getConfig: () =>
				context.globalState.get(SETTINGS_STATE_KEY) ??
				context.globalState.get(LEGACY_SETTINGS_STATE_KEY) ??
				{},
		}),
	);
	const dashboardProvider = new DashboardWebviewViewProvider({
		host,
		client,
		globalState: context.globalState,
		getConfig: () =>
			context.globalState.get(SETTINGS_STATE_KEY) ??
			context.globalState.get(LEGACY_SETTINGS_STATE_KEY) ??
			{},
		settingsStore,
		...withPrefix,
	});
	dashboardRefresh.current = dashboardProvider;
	const dashboardRegistration = host.registerWebviewViewProvider?.(
		DASHBOARD_VIEW_ID,
		dashboardProvider,
	);
	if (dashboardRegistration !== undefined) track(dashboardRegistration);
	// Secondary panels are registered only after the canonical dashboard.
	// A failure in KPI wiring must never make the main web app disappear.
	const kpiRegistration = registerKpiDashboardProvider({
		host,
		client,
		serverConfigured,
		viewId: KPI_VIEW_ID,
		...(namespacePrefix === undefined ? {} : { namespacePrefix }),
	});
	track({ dispose: kpiRegistration.dispose });
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

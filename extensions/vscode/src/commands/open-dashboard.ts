/**
 * `registerOpenDashboardCommand` — opens (or refreshes) the
 * `mcp-vertex Dashboard` webview. The dashboard's HTML is produced
 * by `@mcp-vertex/ui-extension/public`'s `renderDashboard(...)`, fed
 * by a `DashboardService` over the same `McpStdioClient` used by
 * every other command.
 */
import {
	DashboardService,
	EmbedService,
	DEFAULT_EXTENSION_SETTINGS,
	LogsService,
	NotificationsService,
	SettingsService,
	type ILogEvent,
	type ILogOutcome,
	type ILogQueryFilter,
	type ISettingsStore,
	type McpStdioClient,
} from '@mcp-vertex/client';
import type { IDashboardAllModels } from '@mcp-vertex/client';
import { defaultLang, dictsByLang, type Lang } from '../i18n';
import { renderDashboard } from '@mcp-vertex/ui-extension/public';
import { withCsp } from '@mcp-vertex/ui-extension/webview';

import type { IHostAdapter } from '@mcp-vertex/ui-extension/public';

import { DASHBOARD_MESSAGE_SCHEMA } from '../contracts/constants/dashboard-message-schema.constant';
import { OPEN_PROPOSAL_COMMAND } from './open-proposal';
import { OPEN_TOOL_DETAIL_COMMAND } from '../contracts/constants/open-tool-detail-command.constant';
import { OPEN_KNOWLEDGE_COMMAND } from './open-knowledge';
import { OPEN_SETTINGS_COMMAND } from './open-settings';
import { OPEN_CONFIGURATION_CENTER_COMMAND } from './open-configuration-center';
import { REFRESH_COMMAND } from './refresh';
import { HOST_LANG_KEY } from './setup-github';

export const OPEN_DASHBOARD_COMMAND = 'mcp-vertex.openDashboard';
export const OPEN_DASHBOARD_TAB_COMMAND = 'mcp-vertex.openDashboardTab';

const unavailableDashboard = (error: unknown): IDashboardAllModels => {
	const message = error instanceof Error ? error.message : String(error);
	const now = new Date().toISOString();
	const totals = {
		tools: 0,
		plugins: 0,
		proposals: 0,
		calls: 0,
		errors: 0,
		totalMs: 0,
		tokens: 0,
		tokensSaved: 0,
		savingsPercent: 0,
		agents: 0,
	};
	return {
		overview: {
			serverName: 'mcp-vertex',
			serverVersion: 'unavailable',
			namespacePrefix: 'mcp-vertex',
			plugins: [],
			tools: [],
			knowledgeIds: [],
			recommendedNextAction: `MCP server unavailable: ${message}`,
			totals,
		},
		metrics: {
			totals: { calls: 0, errors: 0, totalMs: 0, totalBytes: 0 },
			rows: [],
			sparklines: {},
			collectedAt: now,
		},
		tokens: {
			tokensUsed: 0,
			tokensSaved: 0,
			savingsPercent: 0,
			topByTokens: [],
			history: [],
		},
		tools: { rows: [], sortBy: 'calls', sortDir: 'desc' },
		plugins: { rows: [] },
		proposals: { total: 0, byStatus: {}, rows: [] },
		kpis: {
			totals,
			tokens: { used: 0, saved: 0, savingsPercent: 0 },
			latency: { totalWallMs: 0, p50Ms: 0, p95Ms: 0 },
			spend: null,
		},
		docs: {
			pluginLoaded: false,
			tools: [],
			knowledge: [],
			recommendedNextAction: `MCP server unavailable: ${message}`,
		},
		spend: null,
		sessions: { total: 0, byStatus: {}, rows: [] },
		times: { totalWallMs: 0, p50Ms: 0, p95Ms: 0, histogram: [] },
		agents: { agents: [], totalActive: 0 },
		memory: { state: 'unavailable', notes: [], total: 0, offset: 0 },
		health: {
			healthy: false,
			locksActive: 0,
			queue: null,
			orphans: 0,
			orphansThreshold: 'unknown',
			stale: [],
			staleCount: 0,
			agents: [],
			fetchedAt: now,
		},
		workspace: {
			overview: {
				state: 'unavailable',
				data: {
					serverName: 'mcp-vertex',
					serverVersion: 'unavailable',
					namespacePrefix: 'mcp-vertex',
					plugins: [],
					tools: [],
					knowledgeIds: [],
					recommendedNextAction: `MCP server unavailable: ${message}`,
					totals,
				},
			},
			tools: {
				state: 'unavailable',
				data: { rows: [], sortBy: 'calls', sortDir: 'desc' },
			},
			plugins: { state: 'unavailable', data: { rows: [] } },
			memory: {
				state: 'unavailable',
				data: { state: 'unavailable', notes: [], total: 0, offset: 0 },
			},
			proposals: {
				state: 'unavailable',
				data: { total: 0, byStatus: {}, rows: [] },
			},
			agents: {
				state: 'unavailable',
				data: { agents: [], totalActive: 0 },
			},
			kpis: {
				state: 'unavailable',
				data: {
					totals,
					tokens: { used: 0, saved: 0, savingsPercent: 0 },
					latency: { totalWallMs: 0, p50Ms: 0, p95Ms: 0 },
					spend: null,
				},
			},
			health: {
				state: 'unavailable',
				data: {
					healthy: false,
					locksActive: 0,
					queue: null,
					orphans: 0,
					orphansThreshold: 'unknown',
					stale: [],
					staleCount: 0,
					agents: [],
					fetchedAt: now,
				},
			},
			docs: {
				state: 'unavailable',
				data: {
					pluginLoaded: false,
					tools: [],
					knowledge: [],
					recommendedNextAction: `MCP server unavailable: ${message}`,
				},
			},
		},
		server: { name: 'mcp-vertex', version: 'unavailable', fetchedAt: now },
	};
};

export interface IOpenDashboardDeps {
	readonly host: IHostAdapter;
	readonly client: McpStdioClient;
	readonly globalState?: {
		get<T>(key: string): T | undefined;
		update(key: string, value: unknown): Thenable<void> | Promise<void>;
	};
	readonly settingsStore?: ISettingsStore;
	readonly getConfig: () => {
		readonly extension?: { readonly docsUrl?: string };
	};
	/** Host namespace prefix (f00081 S2). Threaded into the
	 * `DashboardService` so a non-default `--prefix` deployment resolves
	 * `<prefix>_*` tools. */
	readonly namespacePrefix?: string;
}

const resolveLang = (deps: IOpenDashboardDeps): Lang => {
	const persisted = deps.globalState?.get<unknown>(HOST_LANG_KEY);
	return typeof persisted === 'string' && persisted in dictsByLang
		? (persisted as Lang)
		: defaultLang;
};

export const registerOpenDashboardCommand = (deps: IOpenDashboardDeps) => {
	const openDashboardTab = async () => {
		let logsAbort: AbortController | undefined;
		let logsSource = 'all';
		let logsFilter: ILogQueryFilter = {};
		const lang = resolveLang(deps);
		const dashboard = new DashboardService({
			client: deps.client,
			...(deps.namespacePrefix === undefined
				? {}
				: { namespacePrefix: deps.namespacePrefix }),
		});
		const embed = new EmbedService();
		let models: IDashboardAllModels;
		try {
			models = await dashboard.getAllModels();
		} catch (error) {
			models = unavailableDashboard(error);
		}
		const docsUrl = (() => {
			try {
				return embed.resolve(deps.getConfig()).url;
			} catch {
				return 'https://mcp-vertex.dev';
			}
		})();
		const settings = deps.settingsStore
			? await new SettingsService(deps.settingsStore).get()
			: undefined;
		const html = withCsp(
			'dashboard',
			renderDashboard(models, {
				docsUrl,
				refreshCommand: REFRESH_COMMAND,
				openDocsCommand: OPEN_DASHBOARD_COMMAND,
				lang: dictsByLang[lang],
				...(settings === undefined ? {} : { settings }),
			}),
		);
		const panel = deps.host.createWebviewPanel(
			'mcpVertexDashboard',
			'mcp-vertex Dashboard',
			1,
			{ enableScripts: true, retainContextWhenHidden: true },
		);
		panel.webview.setHtml(html);
		panel.webview.onDidReceiveMessage?.(async (msg: unknown) => {
			const parsed = DASHBOARD_MESSAGE_SCHEMA.safeParse(msg);
			if (!parsed.success) return;
			if (parsed.data.command === 'action') {
				try {
					await deps.host.executeCommand?.(
						parsed.data.action === 'expand'
							? OPEN_DASHBOARD_TAB_COMMAND
							: REFRESH_COMMAND,
					);
				} catch {
					// Best-effort in reduced hosts.
				}
				return;
			}
			if (parsed.data.command === 'openTool') {
				await deps.host.executeCommand?.(
					OPEN_TOOL_DETAIL_COMMAND,
					parsed.data.name,
				);
				return;
			}
			if (parsed.data.command === 'openSurface') {
				const commands = {
					proposals: OPEN_PROPOSAL_COMMAND,
					knowledge: OPEN_KNOWLEDGE_COMMAND,
					configuration: OPEN_CONFIGURATION_CENTER_COMMAND,
					settings: OPEN_SETTINGS_COMMAND,
				} as const;
				await deps.host.executeCommand?.(commands[parsed.data.surface]);
				return;
			}
			if (parsed.data.command === 'settings') {
				if (deps.settingsStore === undefined) return;
				try {
					const service = new SettingsService(deps.settingsStore);
					const settings =
						parsed.data.action === 'reset'
							? await service.set(DEFAULT_EXTENSION_SETTINGS)
							: await service.set(parsed.data.settings ?? {});
					await panel.webview.postMessage?.({
						command: 'settingsResult',
						settings,
					});
				} catch (error) {
					await panel.webview.postMessage?.({
						command: 'settingsResult',
						error:
							error instanceof Error
								? error.message
								: String(error),
					});
				}
				return;
			}
			if (parsed.data.command === 'logs') {
				if (
					parsed.data.action === 'source' &&
					parsed.data.source !== undefined
				) {
					logsSource = parsed.data.source;
					return;
				}
				if (parsed.data.action === 'filter') {
					logsFilter = {
						...logsFilter,
						...(parsed.data.outcome === undefined
							? {}
							: { outcome: parsed.data.outcome }),
						...(parsed.data.agent === undefined
							? {}
							: { agent: parsed.data.agent }),
						...(parsed.data.taskId === undefined
							? {}
							: { taskId: parsed.data.taskId }),
					};
					return;
				}
				if (parsed.data.action === 'stop') {
					logsAbort?.abort();
					logsAbort = undefined;
					return;
				}
				if (
					parsed.data.action === 'start' ||
					parsed.data.action === 'refresh'
				) {
					logsAbort?.abort();
					const controller = new AbortController();
					logsAbort = controller;
					const service = new LogsService(deps.client);
					const filter: ILogQueryFilter = {
						...(logsFilter.outcome
							? {
									outcome: logsFilter.outcome as ILogOutcome,
								}
							: {}),
						...(logsFilter.agent
							? { agent: logsFilter.agent }
							: {}),
						...(logsFilter.taskId
							? { taskId: logsFilter.taskId }
							: {}),
					};
					try {
						const seed = await service.tail(50, filter);
						for (const event of seed.events) {
							if (logsSource !== 'all' && logsSource !== 'server')
								continue;
							await panel.webview.postMessage?.({
								command: 'hostLogEvent',
								source: 'server',
								event,
							});
						}
					} catch {
						// The dashboard remains usable when the logs plugin is unavailable.
					}
					const notifications = new NotificationsService(deps.client);
					notifications.addEventListener('lock-released', (event) => {
						if (controller.signal.aborted) return;
						const log: ILogEvent = {
							ts: new Date().toISOString(),
							kind: 'notification',
							agent: event.agent || 'host',
							taskId: event.taskId,
							outcome: 'ok',
							files: event.files ?? [],
							summary: 'lock released',
							meta: { source: 'notifications' },
						};
						void panel.webview.postMessage?.({
							command: 'hostLogEvent',
							source: 'notifications',
							event: log,
						});
					});
					try {
						for await (const event of service.subscribe({
							signal: controller.signal,
							pollIntervalMs: 1500,
							maxEvents: 200,
							...(Object.keys(filter).length === 0
								? {}
								: { filter }),
						})) {
							if (controller.signal.aborted) return;
							if (logsSource !== 'all' && logsSource !== 'server')
								continue;
							await panel.webview.postMessage?.({
								command: 'hostLogEvent',
								source: 'server',
								event,
							});
						}
					} catch {
						// Subscription errors are non-fatal; refresh remains available.
					}
				}
				return;
			}
			if (parsed.data.command === 'openProposal') {
				await deps.host.executeCommand?.(
					OPEN_PROPOSAL_COMMAND,
					parsed.data.id,
				);
				return;
			}
		});
		return panel;
	};
	const focusRegistration = deps.host.registerCommand(
		OPEN_DASHBOARD_COMMAND,
		async () => {
			if (deps.host.executeCommand !== undefined) {
				try {
					await deps.host.executeCommand(
						'workbench.action.openView',
						'mcp-vertex.dashboard',
					);
					return;
				} catch {
					// Fall through to the full-panel fallback.
				}
			}
			await openDashboardTab();
		},
	);
	const tabRegistration = deps.host.registerCommand(
		OPEN_DASHBOARD_TAB_COMMAND,
		openDashboardTab,
	);
	return {
		dispose: () => {
			focusRegistration.dispose();
			tabRegistration.dispose();
		},
	};
};

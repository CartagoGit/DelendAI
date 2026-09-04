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
} from '@delendai/client';
import type { IDashboardAllModels } from '@delendai/client';
import { defaultLang, dictsByLang, type Lang } from '../i18n';
import {
	renderDashboard,
	type IHostAdapter,
	type IWebviewPanel,
} from '@delendai/ui-extension/public';
import { withCsp } from '@delendai/ui-extension/webview';
import { DASHBOARD_MESSAGE_SCHEMA } from '../contracts/constants/dashboard-message-schema.constant';
import { OPEN_PROPOSAL_COMMAND } from '../commands/open-proposal';
import { OPEN_DASHBOARD_TAB_COMMAND } from '../commands/open-dashboard';
import { OPEN_TOOL_DETAIL_COMMAND } from '../contracts/constants/open-tool-detail-command.constant';
import { OPEN_KNOWLEDGE_COMMAND } from '../commands/open-knowledge';
import { OPEN_SETTINGS_COMMAND } from '../commands/open-settings';
import { OPEN_CONFIGURATION_CENTER_COMMAND } from '../commands/open-configuration-center';
import { OPEN_DOCS_COMMAND } from '../commands/open-docs';
import { REFRESH_COMMAND } from '../commands/refresh';
import { HOST_LANG_KEY } from '../commands/setup-github';

export interface IDashboardWebviewViewProviderDeps {
	readonly host: IHostAdapter;
	readonly client: McpStdioClient;
	readonly globalState?: {
		get<T>(key: string): T | undefined;
		update?(key: string, value: unknown): Thenable<void> | Promise<void>;
	};
	readonly settingsStore?: ISettingsStore;
	readonly getConfig: () => {
		readonly extension?: { readonly docsUrl?: string };
	};
	readonly namespacePrefix?: string;
}

const resolveLang = (deps: IDashboardWebviewViewProviderDeps): Lang => {
	const persisted = deps.globalState?.get<unknown>(HOST_LANG_KEY);
	return typeof persisted === 'string' && persisted in dictsByLang
		? (persisted as Lang)
		: defaultLang;
};

const resolveDocsUrl = (
	getConfig: IDashboardWebviewViewProviderDeps['getConfig'],
): string => {
	try {
		return new EmbedService().resolve(getConfig()).url;
	} catch {
		return 'https://mcp-vertex.dev';
	}
};

/**
 * `IDashboardDetailBroker` is the host-side channel that lets commands
 * push host-agnostic detail payloads (tool/proposal) into the dashboard
 * shell overlay. When the broker accepts a payload (returns `true`),
 * the calling command suppresses its standalone-webview fallback so the
 * dashboard overlay becomes the only surface.
 */
export interface IDashboardDetailBroker {
	readonly push: (
		payload:
			| { readonly kind: 'tool'; readonly model: unknown }
			| { readonly kind: 'proposal'; readonly model: unknown },
	) => Promise<boolean>;
	readonly hide: () => Promise<boolean>;
}

const unavailableDashboard = (error: unknown): IDashboardAllModels => {
	const message = error instanceof Error ? error.message : String(error);
	const now = new Date().toISOString();
	const emptyTotals = {
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
			totals: emptyTotals,
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
			totals: emptyTotals,
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
		times: {
			totalWallMs: 0,
			p50Ms: 0,
			p95Ms: 0,
			histogram: [],
		},
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
					totals: emptyTotals,
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
					totals: emptyTotals,
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
		server: {
			name: 'mcp-vertex',
			version: 'unavailable',
			fetchedAt: now,
		},
	};
};

export class DashboardWebviewViewProvider {
	private view: IWebviewPanel | undefined;
	private refreshToken = 0;
	private logsAbort: AbortController | undefined;
	private logsFilter: {
		source?: string;
		outcome?: ILogOutcome;
		agent?: string;
		taskId?: string;
	} = {};
	/**
	 * `detailBroker` lets the `ICommandDeps.detailSink` push a payload
	 * into the dashboard overlay instead of opening a standalone webview
	 * panel. The provider exposes it through `getDetailBroker()` so the
	 * activation flow can wire it into the command deps.
	 */
	private readonly detailBroker: IDashboardDetailBroker;

	constructor(private readonly deps: IDashboardWebviewViewProviderDeps) {
		this.detailBroker = {
			push: (payload) => this.pushDetail(payload),
			hide: () => this.hideDetail(),
		};
	}

	getDetailBroker(): IDashboardDetailBroker {
		return this.detailBroker;
	}

	private async pushDetail(
		payload:
			| { readonly kind: 'tool'; readonly model: unknown }
			| { readonly kind: 'proposal'; readonly model: unknown },
	): Promise<boolean> {
		const view = this.view;
		if (view === undefined) return false;
		const command =
			payload.kind === 'tool' ? 'hostToolDetail' : 'hostProposalDetail';
		try {
			await view.webview.postMessage?.({
				command,
				model: payload.model,
			});
			return true;
		} catch {
			return false;
		}
	}

	private async hideDetail(): Promise<boolean> {
		const view = this.view;
		if (view === undefined) return false;
		try {
			await view.webview.postMessage?.({ command: 'hostHideDetail' });
			return true;
		} catch {
			return false;
		}
	}

	async resolveWebviewView(view: IWebviewPanel): Promise<void> {
		this.view = view;
		view.onDidDispose(() => {
			if (this.view === view) this.view = undefined;
		});
		view.webview.onDidReceiveMessage?.((message: unknown) =>
			this.handleMessage(message),
		);
		await this.refresh();
	}

	async refresh(): Promise<void> {
		const view = this.view;
		if (view === undefined) return;
		const token = ++this.refreshToken;
		const dashboard = new DashboardService({
			client: this.deps.client,
			...(this.deps.namespacePrefix === undefined
				? {}
				: { namespacePrefix: this.deps.namespacePrefix }),
		});
		let models: IDashboardAllModels;
		try {
			models = await dashboard.getAllModels();
		} catch (error) {
			models = unavailableDashboard(error);
		}
		if (token !== this.refreshToken || this.view !== view) return;
		const lang = resolveLang(this.deps);
		const settings = this.deps.settingsStore
			? await new SettingsService(this.deps.settingsStore).get()
			: DEFAULT_EXTENSION_SETTINGS;
		view.webview.setHtml(
			withCsp(
				'dashboard',
				renderDashboard(models, {
					docsUrl: resolveDocsUrl(this.deps.getConfig),
					refreshCommand: REFRESH_COMMAND,
					openDocsCommand: OPEN_DOCS_COMMAND,
					lang: dictsByLang[lang],
					settings,
				}),
			),
		);
	}

	private async handleMessage(message: unknown): Promise<void> {
		const parsed = DASHBOARD_MESSAGE_SCHEMA.safeParse(message);
		if (!parsed.success) return;
		if (parsed.data.command === 'action') {
			await this.deps.host.executeCommand?.(
				parsed.data.action === 'expand'
					? OPEN_DASHBOARD_TAB_COMMAND
					: REFRESH_COMMAND,
			);
			return;
		}
		if (parsed.data.command === 'openTool') {
			await this.deps.host.executeCommand?.(
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
			await this.deps.host.executeCommand?.(
				commands[parsed.data.surface],
			);
			return;
		}
		if (parsed.data.command === 'settings') {
			if (
				this.deps.settingsStore === undefined ||
				this.view === undefined
			)
				return;
			try {
				const service = new SettingsService(this.deps.settingsStore);
				const settings =
					parsed.data.action === 'reset'
						? await service.set(DEFAULT_EXTENSION_SETTINGS)
						: await service.set(parsed.data.settings ?? {});
				await this.view.webview.postMessage?.({
					command: 'settingsResult',
					settings,
				});
			} catch (error) {
				await this.view.webview.postMessage?.({
					command: 'settingsResult',
					error:
						error instanceof Error ? error.message : String(error),
				});
			}
			return;
		}
		if (parsed.data.command === 'logs') {
			await this.handleLogsCommand(parsed.data);
			return;
		}
		if (parsed.data.command !== 'openProposal') {
			return;
		}
		await this.deps.host.executeCommand?.(
			OPEN_PROPOSAL_COMMAND,
			parsed.data.id,
		);
	}

	private async handleLogsCommand(payload: {
		action: string;
		source?: string | undefined;
		outcome?: ILogOutcome | undefined;
		agent?: string | undefined;
		taskId?: string | undefined;
	}): Promise<void> {
		if (payload.action === 'source' && payload.source !== undefined) {
			this.logsFilter.source = payload.source;
			return;
		}
		if (payload.action === 'filter') {
			const next = { ...this.logsFilter };
			if (payload.outcome !== undefined) next.outcome = payload.outcome;
			else delete next.outcome;
			if (payload.agent !== undefined) next.agent = payload.agent;
			else delete next.agent;
			if (payload.taskId !== undefined) next.taskId = payload.taskId;
			else delete next.taskId;
			this.logsFilter = next;
			return;
		}
		if (payload.action === 'stop') {
			this.logsAbort?.abort();
			this.logsAbort = undefined;
			return;
		}
		if (payload.action === 'start' || payload.action === 'refresh') {
			await this.startLogStream();
		}
	}

	private async startLogStream(): Promise<void> {
		if (this.deps.client === undefined) return;
		this.logsAbort?.abort();
		const controller = new AbortController();
		this.logsAbort = controller;
		const service = new LogsService(this.deps.client);
		// Seed with the most recent events so the user has context.
		try {
			const tailFilter = this.toFilter();
			const seed = await service.tail(
				50,
				Object.keys(tailFilter).length === 0
					? {}
					: (tailFilter as Parameters<typeof service.tail>[1]),
			);
			for (const event of seed.events) {
				await this.pushLogEvent(event, 'server');
			}
		} catch {
			// MCP may not have the logs plugin loaded; fall back to
			// NotificationsService host events only.
		}
		const notifications = new NotificationsService(this.deps.client);
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
			void this.pushLogEvent(log, 'notifications');
		});
		try {
			const filter = this.toFilter();
			const subscribeOptions: {
				signal: AbortSignal;
				pollIntervalMs: number;
				maxEvents: number;
				filter?: Parameters<LogsService['subscribe']>[0] extends infer T
					? T extends { filter?: infer F }
						? F
						: never
					: never;
			} = {
				signal: controller.signal,
				pollIntervalMs: 1500,
				maxEvents: 200,
			};
			if (Object.keys(filter).length > 0) {
				subscribeOptions.filter = filter as never;
			}
			for await (const event of service.subscribe(subscribeOptions)) {
				if (controller.signal.aborted) return;
				await this.pushLogEvent(event, 'server');
			}
		} catch {
			// Subscribe errors are non-fatal; the user can retry.
		}
	}

	private toFilter(): ILogQueryFilter {
		return {
			...(this.logsFilter.outcome !== undefined
				? { outcome: this.logsFilter.outcome }
				: {}),
			...(this.logsFilter.agent !== undefined &&
			this.logsFilter.agent !== ''
				? { agent: this.logsFilter.agent }
				: {}),
			...(this.logsFilter.taskId !== undefined &&
			this.logsFilter.taskId !== ''
				? { taskId: this.logsFilter.taskId }
				: {}),
		};
	}

	private async pushLogEvent(
		event: ILogEvent,
		source: 'server' | 'notifications' | 'host' | 'mcp' | 'errors',
	): Promise<void> {
		const view = this.view;
		if (view === undefined) return;
		try {
			await view.webview.postMessage?.({
				command: 'hostLogEvent',
				source,
				event,
			});
		} catch {
			// Best-effort: the panel may have been disposed mid-write.
		}
	}
}

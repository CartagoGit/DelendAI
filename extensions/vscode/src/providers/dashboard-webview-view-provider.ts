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
	escapeHtml,
	renderDashboard,
	type IHostAdapter,
	type IWebviewPanel,
} from '@delendai/ui-extension/public';
import {
	renderProposalDetailBody,
	renderToolDetailBody,
	type IProposalDetail,
	type IToolDetail,
	withCsp,
} from '@delendai/ui-extension/webview';
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
		return 'https://delendai.dev';
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

const MAX_LIVE_ROWS = 10;

/** What is happening now: one `work status` read, flattened. */
interface IDashboardLiveState {
	readonly units: Readonly<Record<string, number>>;
	readonly publications: ReadonlyArray<{
		readonly ref: string;
		readonly behind: number;
		readonly overlapping: number;
		readonly ownerAlive: boolean;
	}>;
	readonly waitingOnAuthor: ReadonlyArray<{
		readonly ref: string;
		readonly why: string;
	}>;
	readonly computeHolder: string | null;
	readonly urgent: readonly string[];
	readonly blocked: readonly string[];
}

const asRecord = <TKey extends string = string>(
	value: unknown,
): Partial<Record<TKey, unknown>> =>
	typeof value === 'object' && value !== null
		? (value as Partial<Record<TKey, unknown>>)
		: {};

const asArray = (value: unknown): readonly unknown[] =>
	Array.isArray(value) ? value : [];

const asText = (value: unknown): string =>
	typeof value === 'string' ? value : '';

const asCount = (value: unknown): number =>
	typeof value === 'number' && Number.isFinite(value) ? value : 0;

/**
 * Flatten the `work` tool's `status` payload. Every field is read
 * defensively: an older server that lacks one leaves it empty instead of
 * failing the whole section.
 */
export const toLiveState = (data: unknown): IDashboardLiveState => {
	const payload = asRecord<
		| 'computeSlot'
		| 'units'
		| 'waitingOnAuthor'
		| 'anchorRefusal'
		| 'undurable'
		| 'orphans'
		| 'publications'
	>(data);
	const slot = asRecord<'holder' | 'urgent'>(payload.computeSlot);
	const units: Record<string, number> = {};
	for (const [name, count] of Object.entries(asRecord(payload.units))) {
		units[name] = asCount(count);
	}
	const waiting = asArray(payload.waitingOnAuthor).map((entry) => {
		const each = asRecord(entry);
		return {
			ref: asText(each.headRef) || `#${String(asCount(each.number))}`,
			why: asText(each.why),
		};
	});
	const blocked = [
		...(asText(payload.anchorRefusal) === ''
			? []
			: [asText(payload.anchorRefusal)]),
		...asArray(payload.undurable).map(
			(path) => `undurable edit: ${asText(path)}`,
		),
		...asArray(payload.orphans).map((entry) => {
			const each = asRecord<'ref' | 'reason'>(entry);
			return `${asText(each.ref)}: ${asText(each.reason)}`;
		}),
		...waiting.map((entry) => `${entry.ref}: ${entry.why}`),
	];
	return {
		units,
		publications: asArray(payload.publications).map((entry) => {
			const each = asRecord<
				'ref' | 'behind' | 'overlapping' | 'ownerAlive'
			>(entry);
			return {
				ref: asText(each.ref),
				behind: asCount(each.behind),
				overlapping: asCount(each.overlapping),
				ownerAlive: each.ownerAlive !== false,
			};
		}),
		waitingOnAuthor: waiting,
		computeHolder: asText(slot.holder) || null,
		urgent: asArray(slot.urgent).map((ticket) =>
			asText(asRecord<'label'>(ticket).label),
		),
		blocked,
	};
};

const listItems = (items: readonly string[]): string =>
	items.length === 0
		? '<p>none</p>'
		: `<ul>${items
				.slice(0, MAX_LIVE_ROWS)
				.map((item) => `<li>${escapeHtml(item)}</li>`)
				.join('')}</ul>`;

/** The "happening now" section, escaped, ready to sit in the dashboard. */
export const renderLiveSection = (
	live: IDashboardLiveState | undefined,
	models: IDashboardAllModels,
): string => {
	const queue = models.health.queue;
	const tokens = models.tokens;
	const body =
		live === undefined
			? '<p>Live state unavailable.</p>'
			: [
					`<h3>Units</h3>${listItems(Object.entries(live.units).map(([name, count]) => `${name}: ${String(count)}`))}`,
					`<h3>Publications</h3>${listItems(
						live.publications.map(
							(each) =>
								`${each.ref}: ${String(each.behind)} behind, ${String(each.overlapping)} overlapping, owner ${each.ownerAlive ? 'alive' : 'gone'}`,
						),
					)}`,
					`<h3>Queue</h3>${listItems([
						`compute slot: ${live.computeHolder ?? 'free'}`,
						...live.urgent.map((label) => `urgent: ${label}`),
						...(queue === null
							? []
							: [
									`waiting: ${String(queue.queued)} of ${String(queue.length)}, oldest ${String(queue.oldestAgeMinutes)} min`,
								]),
					])}`,
					`<h3>Blocked</h3>${listItems(live.blocked)}`,
				].join('');
	return `<section id="delendai-live" class="card"><h2>Now</h2>${body}<h3>Tokens</h3>${listItems(
		[
			`used: ${String(tokens.tokensUsed)}`,
			`saved: ${String(tokens.tokensSaved)} (${String(tokens.savingsPercent)}%)`,
		],
	)}</section>`;
};

/** The section goes right after the opening body tag, or leads the page. */
const withLiveSection = (html: string, section: string): string =>
	/<body[^>]*>/iu.test(html)
		? html.replace(/<body[^>]*>/iu, (open) => `${open}${section}`)
		: `${section}${html}`;

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
			serverName: 'delendai',
			serverVersion: 'unavailable',
			namespacePrefix: 'delendai',
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
					serverName: 'delendai',
					serverVersion: 'unavailable',
					namespacePrefix: 'delendai',
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
			name: 'delendai',
			version: 'unavailable',
			fetchedAt: now,
		},
	};
};

export class DashboardWebviewViewProvider {
	private view: IWebviewPanel | undefined;
	private refreshToken = 0;
	private logsAbort: AbortController | undefined;
	private liveAbort: AbortController | undefined;
	private liveModels: IDashboardAllModels | undefined;
	private liveSerialized = '';
	private liveInFlight = false;
	private liveDirty = false;
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
				html:
					payload.kind === 'tool'
						? renderToolDetailBody(payload.model as IToolDetail)
						: renderProposalDetailBody(
								payload.model as IProposalDetail,
							),
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
			this.logsAbort?.abort();
			this.logsAbort = undefined;
			this.liveAbort?.abort();
			this.liveAbort = undefined;
			if (this.view === view) this.view = undefined;
		});
		view.webview.onDidReceiveMessage?.((message: unknown) =>
			this.handleMessage(message),
		);
		await this.refresh();
		void this.watchLive();
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
		const live = await this.readLive();
		if (token !== this.refreshToken || this.view !== view) return;
		this.liveModels = models;
		this.liveSerialized = JSON.stringify(live ?? null);
		await this.render(view, models, live);
	}

	private async render(
		view: IWebviewPanel,
		models: IDashboardAllModels,
		live: IDashboardLiveState | undefined,
	): Promise<void> {
		const lang = resolveLang(this.deps);
		const settings = this.deps.settingsStore
			? await new SettingsService(this.deps.settingsStore).get()
			: DEFAULT_EXTENSION_SETTINGS;
		view.webview.setHtml(
			withCsp(
				'dashboard',
				withLiveSection(
					renderDashboard(models, {
						docsUrl: resolveDocsUrl(this.deps.getConfig),
						refreshCommand: REFRESH_COMMAND,
						openDocsCommand: OPEN_DOCS_COMMAND,
						lang: dictsByLang[lang],
						settings,
					}),
					renderLiveSection(live, models),
				),
			),
		);
	}

	private async readLive(): Promise<IDashboardLiveState | undefined> {
		try {
			const out = await this.deps.client.request<
				{ action: string },
				{ ok?: boolean; data?: unknown }
			>(`${this.deps.namespacePrefix ?? 'delendai'}_work`, {
				action: 'status',
			});
			return out.ok === false ? undefined : toLiveState(out.data);
		} catch {
			return undefined;
		}
	}

	/**
	 * One live read per burst of events, never one per event: an event
	 * that lands while a read is in flight asks for exactly one more.
	 */
	private async onLiveEvent(): Promise<void> {
		if (this.liveInFlight) {
			this.liveDirty = true;
			return;
		}
		this.liveInFlight = true;
		try {
			do {
				this.liveDirty = false;
				const view = this.view;
				const models = this.liveModels;
				if (view === undefined || models === undefined) return;
				const live = await this.readLive();
				const serialized = JSON.stringify(live ?? null);
				if (this.view !== view || serialized === this.liveSerialized) {
					continue;
				}
				this.liveSerialized = serialized;
				await this.render(view, models, live);
			} while (this.liveDirty);
		} finally {
			this.liveInFlight = false;
		}
	}

	/** The server's event stream drives the section; panels are not polled. */
	private async watchLive(): Promise<void> {
		if (this.view === undefined) return;
		this.liveAbort?.abort();
		const controller = new AbortController();
		this.liveAbort = controller;
		try {
			for await (const _event of new LogsService(
				this.deps.client,
			).subscribe({ signal: controller.signal })) {
				if (controller.signal.aborted) return;
				await this.onLiveEvent();
			}
		} catch {
			// The events plugin may be absent; the section keeps its last read.
		}
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

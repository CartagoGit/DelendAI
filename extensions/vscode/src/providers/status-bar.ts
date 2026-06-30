import {
	type INotificationEventName,
	type McpStdioClient,
	type NotificationsService,
	type OverviewService,
	formatToolName,
} from '@mcp-vertex/client';

import { OPEN_DASHBOARD_COMMAND } from '../commands/open-dashboard';
import { SHOW_OVERVIEW_COMMAND } from '../extension';

export interface IStatusBarItem {
	text: string;
	tooltip?: string;
	command?: string;
	show(): void;
	dispose(): void;
}

export interface IProposalBoardSummary {
	readonly proposals: readonly { readonly id: string }[];
}

/**
 * Type of the `notifications` dependency. We pin to `addEventListener`
 * + `removeEventListener` so the status bar can detach on `dispose()`
 * without taking a hard dependency on the full service surface. This
 * matters because the previous version called `addEventListener` three
 * times in `start()` and never removed them — every window reload leaked
 * three more listeners onto the same `NotificationsService`, and every
 * notification event fired 3× the update requests.
 */
export type INotificationsLike = Pick<
	NotificationsService,
	'addEventListener' | 'removeEventListener'
>;

/**
 * Why the status bar reacts to a notification — a locale-neutral key
 * (the previous table mixed English `cap` with Spanish `bloqueado`
 * literals, which is an i18n leak and an OCP hazard). The bar only
 * needs to refresh, so the config stays minimal; richer per-event
 * behaviour can be added here without touching the dispatcher.
 */
export interface IStatusBarEventConfig {
	/** Stable, locale-independent reason code for this subscription. */
	readonly reason: 'lock' | 'capacity' | 'blocked';
}

/**
 * Events the status bar subscribes to, keyed by the canonical
 * `INotificationEventName` discriminated union from the client.
 * This map is exhaustive over the union: adding a new notification
 * event name to the client without adding an entry here is a compile
 * error (H30 — OCP). The dispatcher iterates the keys, so a new event
 * needs only a map entry, never a dispatcher edit.
 */
const STATUS_BAR_EVENTS: Readonly<
	Record<INotificationEventName, IStatusBarEventConfig>
> = {
	'lock-released': { reason: 'lock' },
	cap: { reason: 'capacity' },
	bloqueado: { reason: 'blocked' },
};

/** The event names the status bar subscribes to (derived from the map). */
const STATUS_BAR_EVENT_NAMES = Object.keys(
	STATUS_BAR_EVENTS,
) as readonly INotificationEventName[];

/**
 * `McpVertexStatusBar` — VS Code status bar summary, upgraded in f00022
 * to include the same KPIs the dashboard exposes (tools, proposals,
 * tokens, agents). Click → open the dashboard.
 *
 * Lifecycle contract (f00047 S6 + reload-leak fix): the bar is a real
 * disposable. Calling `dispose()` removes every notification listener
 * it registered and disposes the underlying status bar item, so
 * `deactivate()` -> `runtimeHandle.disposeAll()` cleans up cleanly on
 * every window reload.
 */
export class McpVertexStatusBar {
	/** The callbacks we registered, keyed by event name. Used for
	 * `removeEventListener` on dispose — we MUST keep the same function
	 * references for `removeEventListener` to match. */
	private readonly registeredListeners: Map<
		string & {},
		(event: unknown) => void
	> = new Map();
	private disposed = false;

	constructor(
		private readonly item: IStatusBarItem,
		private readonly overview: Pick<OverviewService, 'listTools'>,
		private readonly client: Pick<McpStdioClient, 'request'>,
		private readonly notifications?: INotificationsLike,
		private readonly openDashboardCommand: string = OPEN_DASHBOARD_COMMAND,
		_showOverviewCommand: string = SHOW_OVERVIEW_COMMAND,
		// f00081 S2: thread the host namespace prefix so the status-bar's
		// own direct `client.request(...)` probes hit `<prefix>_*` tools.
		private readonly namespacePrefix?: string,
	) {}

	async start(): Promise<void> {
		this.item.command = this.openDashboardCommand;
		this.item.tooltip = 'mcp-vertex Dashboard (click to open)';
		for (const event of STATUS_BAR_EVENT_NAMES) {
			const handler = (): void => {
				void this.update();
			};
			this.registeredListeners.set(event, handler);
			this.notifications?.addEventListener(
				event as Parameters<INotificationsLike['addEventListener']>[0],
				// The notification service accepts a generic callback;
				// the event shape is richer than we need here.
				handler as Parameters<
					INotificationsLike['addEventListener']
				>[1],
			);
		}
		await this.update();
		this.item.show();
	}

	async update(): Promise<void> {
		if (this.disposed) return;
		const tools = await this.overview.listTools();
		const proposalCount = await this.proposalCount();
		const tokenSummary = await this.tokensSummary();
		const agentCount = await this.agentCount();
		const segments: string[] = ['$(mcp-vertex) mcp-vertex'];
		segments.push(`${tools.length} tools`);
		segments.push(`${proposalCount} proposals`);
		if (tokenSummary !== undefined) segments.push(tokenSummary);
		if (agentCount !== undefined) segments.push(`${agentCount} agents`);
		this.item.text = segments.join(' • ');
	}

	dispose(): void {
		if (this.disposed) return;
		this.disposed = true;
		for (const [event, handler] of this.registeredListeners) {
			this.notifications?.removeEventListener(
				event as Parameters<
					INotificationsLike['removeEventListener']
				>[0],
				handler as Parameters<
					INotificationsLike['removeEventListener']
				>[1],
			);
		}
		this.registeredListeners.clear();
		this.item.dispose();
	}

	private async proposalCount(): Promise<number | string> {
		try {
			const board = await this.client.request<
				Record<string, never>,
				IProposalBoardSummary
			>(
				formatToolName(
					this.namespacePrefix,
					'proposals_proposal_board',
				),
				{},
			);
			return board.proposals.length;
		} catch {
			return '?';
		}
	}

	private async tokensSummary(): Promise<string | undefined> {
		try {
			const snap = await this.client.request<
				Record<string, never>,
				{
					readonly totals: { readonly totalBytes: number };
				}
			>(formatToolName(this.namespacePrefix, 'metrics'), {});
			const tokens = Math.ceil(snap.totals.totalBytes * 0.25);
			if (tokens < 1000) return `${tokens} tok`;
			return `${(tokens / 1000).toFixed(1)}k tok`;
		} catch {
			return undefined;
		}
	}

	private async agentCount(): Promise<number | undefined> {
		try {
			const result = await this.client.request<
				{ readonly action: 'list' },
				{
					readonly agents?: readonly { readonly name: string }[];
					readonly assignments?: readonly {
						readonly agent_name: string;
						readonly status?: 'active' | 'cooldown' | 'orphan';
					}[];
				}
			>(formatToolName(this.namespacePrefix, 'proposals_agent_names'), {
				action: 'list',
			});
			if (Array.isArray(result.agents)) return result.agents.length;
			if (Array.isArray(result.assignments)) {
				return result.assignments.filter(
					(a) => a.status === undefined || a.status === 'active',
				).length;
			}
			return 0;
		} catch {
			return undefined;
		}
	}
}

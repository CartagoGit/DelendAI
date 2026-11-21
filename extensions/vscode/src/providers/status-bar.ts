import {
	type INotificationEventName,
	type McpStdioClient,
	type NotificationsService,
	type OverviewService,
	formatToolName,
} from '@delendai/client';

import { OPEN_DASHBOARD_COMMAND } from '../commands/open-dashboard';
import { SHOW_OVERVIEW_COMMAND } from '../extension';
import type { IStatusBarTooltip } from '../contracts/interfaces/status-bar-tooltip.interface';

/** The label is the extension's display name, exactly. */
const STATUS_BAR_LABEL = 'DelendAI';

export interface IStatusBarItem {
	text: string;
	tooltip?: string | IStatusBarTooltip;
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

interface IStatusAnswer {
	readonly runtime?: { readonly summary?: string };
	readonly maintenance?: {
		readonly maintains?: boolean;
		readonly maintainer?: string;
	};
}

interface IWorkAnswer {
	readonly data?: {
		readonly computeSlot?: { readonly holder?: string };
		readonly units?: Readonly<Record<string, number>>;
		readonly publications?: readonly unknown[];
	};
}

const markdownText = (value: string): string =>
	value.replace(/[\\`*_{}[\]()#+!|<>~-]/gu, (char) => `\\${char}`);

const unitsText = (units: Readonly<Record<string, number>> | undefined) =>
	units === undefined || Object.keys(units).length === 0
		? 'none'
		: Object.entries(units)
				.map(([state, count]) => `${String(count)} ${state}`)
				.join(', ');

/** The tooltip, in Markdown, from what the server last said. */
const tooltipMarkdown = (answers: {
	readonly status?: IStatusAnswer | undefined;
	readonly work?: IWorkAnswer | undefined;
}): string => {
	const { status, work } = answers;
	if (status === undefined && work === undefined) {
		return `**${STATUS_BAR_LABEL}**\n\nConnection: not connected yet. Click to open the dashboard.`;
	}
	const data = work?.data;
	const maintenance = status?.maintenance;
	const maintainer =
		maintenance === undefined
			? 'unknown'
			: maintenance.maintains === true
				? 'this server'
				: (maintenance.maintainer ?? 'nobody yet');
	return [
		`**${STATUS_BAR_LABEL}**`,
		`Version: ${markdownText(status?.runtime?.summary ?? 'unknown')}`,
		'Connection: connected',
		`Maintained by: ${markdownText(maintainer)}`,
		`Compute slot: ${markdownText(data?.computeSlot?.holder ?? 'free')}`,
		`Active units: ${markdownText(unitsText(data?.units))}`,
		`Open PRs: ${String(data?.publications?.length ?? 0)}`,
		'Click to open the dashboard.',
	].join('\n\n');
};

/**
 * `DelendaiStatusBar` — VS Code status bar summary, upgraded in f00022
 * to include the same KPIs the dashboard exposes (tools, proposals,
 * tokens, agents). Click → open the dashboard.
 *
 * Lifecycle contract (f00047 S6 + reload-leak fix): the bar is a real
 * disposable. Calling `dispose()` removes every notification listener
 * it registered and disposes the underlying status bar item, so
 * `deactivate()` -> `runtimeHandle.disposeAll()` cleans up cleanly on
 * every window reload.
 */
export class DelendaiStatusBar {
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
		_overview: Pick<OverviewService, 'listTools'>,
		private readonly client: Pick<McpStdioClient, 'request'>,
		private readonly notifications?: INotificationsLike,
		private readonly openDashboardCommand: string = OPEN_DASHBOARD_COMMAND,
		_showOverviewCommand: string = SHOW_OVERVIEW_COMMAND,
		// f00081 S2: thread the host namespace prefix so the status-bar's
		// own direct `client.request(...)` probes hit `<prefix>_*` tools.
		private readonly namespacePrefix?: string,
		/** Builds the host's own MarkdownString; absent, a value of its shape. */
		private readonly markdownString?: (value: string) => IStatusBarTooltip,
	) {}

	start(): void {
		if (this.disposed) return;
		this.item.command = this.openDashboardCommand;
		this.item.text = STATUS_BAR_LABEL;
		this.item.tooltip = this.markdown(tooltipMarkdown({}));
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
		this.item.show();
		void this.update();
	}

	/** Rewrites the tooltip from the server's own answers; the label never changes. */
	async update(): Promise<void> {
		if (this.disposed) return;
		const [status, work] = await Promise.all([
			this.read<IStatusAnswer>('status', {}),
			this.read<IWorkAnswer>('work', { action: 'status' }),
		]);
		if (this.disposed) return;
		this.item.text = STATUS_BAR_LABEL;
		this.item.tooltip = this.markdown(tooltipMarkdown({ status, work }));
	}

	private markdown(value: string): IStatusBarTooltip {
		return (
			this.markdownString?.(value) ?? {
				value,
				isTrusted: false,
				supportThemeIcons: true,
			}
		);
	}

	/** One shared-client call; `undefined` when the server does not answer. */
	private async read<T>(
		tool: string,
		input: Record<string, unknown>,
	): Promise<T | undefined> {
		try {
			return await this.client.request<Record<string, unknown>, T>(
				formatToolName(this.namespacePrefix, tool),
				input,
			);
		} catch {
			return undefined;
		}
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
}

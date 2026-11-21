/**
 * `renderPanelLogs` — log timeline with a source selector.
 *
 * Sources:
 *   - `host` — log lines the host extension itself produced
 *     (notifications, command errors, watch hits). Sourced from
 *     `NotificationsService` for live events.
 *   - `server` — MCP server logs from the `logs` plugin
 *     (`delendai_logs_tail` / `_query`).
 *   - `mcp` — aggregated events from external MCP servers routed
 *     through the host.
 *   - `notifications` — only `lock-released` / `cap` / `bloqueado`
 *     events for swarm monitoring.
 *   - `errors` — only the `failed` / `timed-out` / `dead` outcomes
 *     across every other source.
 *   - `all` — combined stream.
 *
 * The panel is a pure renderer: the runtime subscribes to the live
 * `delendai_logs_subscribe` stream and pushes events via
 * `hostLogEvent`. The client script (rendered below) merges them into
 * the DOM and supports pause / resume / clear / follow-tail.
 */
import type { ILangDict } from '@delendai/shared/i18n';

import { extensionText } from '../i18n/extension-text';
import { escapeHtml } from './format';

const SOURCE_KEYS = [
	'host',
	'server',
	'mcp',
	'notifications',
	'errors',
	'all',
] as const;

const SOURCE_ICON: Record<(typeof SOURCE_KEYS)[number], string> = {
	host: '⚙',
	server: '⌘',
	mcp: '⊕',
	notifications: '✦',
	errors: '⚠',
	all: '◎',
};

const renderSourceOption = (
	source: (typeof SOURCE_KEYS)[number],
	text: (key: string, fallback: string) => string,
): string => `<label class="delendai-logs__chip" data-source="${source}" aria-pressed="${source === 'all' ? 'true' : 'false'}">
	<span class="delendai-logs__chip-icon" aria-hidden="true">${SOURCE_ICON[source]}</span>
	<span>${escapeHtml(text(`logs.source.${source}`, source))}</span>
</label>`;

export const renderPanelLogs = (lang: ILangDict): string => {
	const text = (key: string, fallback: string): string =>
		extensionText(lang, key) || fallback;
	const sourceChips = SOURCE_KEYS.map((source) =>
		renderSourceOption(source, text),
	).join('');
	return `<section class="delendai-panel" id="panel-logs" role="tabpanel" aria-labelledby="tab-logs">
	<h2 class="delendai-panel__title">${escapeHtml(text('tabLogs', 'Logs'))}</h2>
	<p class="delendai-fg-muted">${escapeHtml(text('logs.lead', 'Realtime redacted stream of MCP events. Switch the source to focus on a slice of the system.'))}</p>
	<div class="delendai-logs" id="delendai-logs-root">
		<div class="delendai-logs__search">
			<span aria-hidden="true">🔎</span>
			<input type="search" id="delendai-logs-search" placeholder="${escapeHtml(text('logs.searchPlaceholder', 'Filter visible events'))}" />
		</div>
		<div class="delendai-logs__source-bar" id="delendai-logs-sources" role="radiogroup" aria-label="${escapeHtml(text('logs.source', 'Source'))}">
			${sourceChips}
		</div>
		<form class="delendai-logs__controls" id="delendai-logs-controls">
			<label class="delendai-logs__filter">
				<span>${escapeHtml(text('logs.filter.outcome', 'Outcome'))}</span>
				<select name="outcome">
					<option value="">${escapeHtml(text('logs.source.all', 'All'))}</option>
					<option value="ok">${escapeHtml(text('logs.outcome.ok', 'OK'))}</option>
					<option value="failed">${escapeHtml(text('logs.outcome.failed', 'Failed'))}</option>
					<option value="timed-out">${escapeHtml(text('logs.outcome.timed_out', 'Timed out'))}</option>
					<option value="cancelled">${escapeHtml(text('logs.outcome.cancelled', 'Cancelled'))}</option>
					<option value="dead">${escapeHtml(text('logs.outcome.dead', 'Dead'))}</option>
					<option value="idle">${escapeHtml(text('logs.outcome.idle', 'Idle'))}</option>
					<option value="unknown">${escapeHtml(text('logs.outcome.unknown', 'Unknown'))}</option>
				</select>
			</label>
			<label class="delendai-logs__filter">
				<span>${escapeHtml(text('logs.filter.agent', 'Agent'))}</span>
				<input name="agent" type="search" placeholder="${escapeHtml(text('logs.filter.agent', 'Agent'))}" />
			</label>
			<label class="delendai-logs__filter">
				<span>${escapeHtml(text('logs.filter.task', 'Task'))}</span>
				<input name="task" type="search" placeholder="${escapeHtml(text('logs.filter.task', 'Task'))}" />
			</label>
			<div class="delendai-logs__actions">
				<button type="button" data-logs-action="refresh" class="delendai-button">${escapeHtml(text('logs.refresh', 'Refresh'))}</button>
				<button type="button" data-logs-action="toggle-live" class="delendai-button delendai-button--primary">${escapeHtml(text('logs.subscribe.start', 'Start realtime'))}</button>
				<button type="button" data-logs-action="clear" class="delendai-button">${escapeHtml(text('logs.clear', 'Clear'))}</button>
			</div>
			<p class="delendai-logs__status" id="delendai-logs-status" role="status" aria-live="polite">${escapeHtml(text('logs.subscribe.idle', 'Realtime paused'))}</p>
		</form>
		<ol class="delendai-logs__list" id="delendai-logs-list" aria-live="polite"></ol>
		<p class="delendai-logs__empty" id="delendai-logs-empty">${escapeHtml(text('logs.empty', 'No log events match the current filter.'))}</p>
		<div class="delendai-logs__detail" id="delendai-logs-detail" hidden role="dialog" aria-modal="true" aria-labelledby="delendai-logs-detail-title">
			<header class="delendai-logs__detail-head">
				<h3 id="delendai-logs-detail-title"></h3>
				<button type="button" class="delendai-button" data-logs-action="close-detail">×</button>
			</header>
			<dl class="delendai-logs__detail-body" id="delendai-logs-detail-body"></dl>
		</div>
	</div>
</section>`;
};

/**
 * `renderPanelLogs` — log timeline with a source selector.
 *
 * Sources:
 *   - `host` — log lines the host extension itself produced
 *     (notifications, command errors, watch hits). Sourced from
 *     `NotificationsService` for live events.
 *   - `server` — MCP server logs from the `logs` plugin
 *     (`mcp-vertex_logs_tail` / `_query`).
 *   - `mcp` — aggregated events from external MCP servers routed
 *     through the host.
 *   - `notifications` — only `lock-released` / `cap` / `bloqueado`
 *     events for swarm monitoring.
 *   - `errors` — only the `failed` / `timed-out` / `dead` outcomes
 *     across every other source.
 *   - `all` — combined stream.
 *
 * The panel is a pure renderer: the runtime subscribes to the live
 * `mcp-vertex_logs_subscribe` stream and pushes events via
 * `hostLogEvent`. The client script (rendered below) merges them into
 * the DOM and supports pause / resume / clear / follow-tail.
 */
import type { ILangDict } from '@mcp-vertex/shared/i18n';

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
): string => `<label class="mcpv-logs__chip" data-source="${source}" aria-pressed="${source === 'all' ? 'true' : 'false'}">
	<span class="mcpv-logs__chip-icon" aria-hidden="true">${SOURCE_ICON[source]}</span>
	<span>${escapeHtml(text(`logs.source.${source}`, source))}</span>
</label>`;

export const renderPanelLogs = (lang: ILangDict): string => {
	const text = (key: string, fallback: string): string =>
		extensionText(lang, key) || fallback;
	const sourceChips = SOURCE_KEYS.map((source) =>
		renderSourceOption(source, text),
	).join('');
	return `<section class="mcpv-panel" id="panel-logs" role="tabpanel" aria-labelledby="tab-logs">
	<h2 class="mcpv-panel__title">${escapeHtml(text('tabLogs', 'Logs'))}</h2>
	<p class="mcpv-fg-muted">${escapeHtml(text('logs.lead', 'Realtime redacted stream of MCP events. Switch the source to focus on a slice of the system.'))}</p>
	<div class="mcpv-logs" id="mcpv-logs-root">
		<div class="mcpv-logs__search">
			<span aria-hidden="true">🔎</span>
			<input type="search" id="mcpv-logs-search" placeholder="${escapeHtml(text('logs.searchPlaceholder', 'Filter visible events'))}" />
		</div>
		<div class="mcpv-logs__source-bar" id="mcpv-logs-sources" role="radiogroup" aria-label="${escapeHtml(text('logs.source', 'Source'))}">
			${sourceChips}
		</div>
		<form class="mcpv-logs__controls" id="mcpv-logs-controls">
			<label class="mcpv-logs__filter">
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
			<label class="mcpv-logs__filter">
				<span>${escapeHtml(text('logs.filter.agent', 'Agent'))}</span>
				<input name="agent" type="search" placeholder="${escapeHtml(text('logs.filter.agent', 'Agent'))}" />
			</label>
			<label class="mcpv-logs__filter">
				<span>${escapeHtml(text('logs.filter.task', 'Task'))}</span>
				<input name="task" type="search" placeholder="${escapeHtml(text('logs.filter.task', 'Task'))}" />
			</label>
			<div class="mcpv-logs__actions">
				<button type="button" data-logs-action="refresh" class="mcpv-button">${escapeHtml(text('logs.refresh', 'Refresh'))}</button>
				<button type="button" data-logs-action="toggle-live" class="mcpv-button mcpv-button--primary">${escapeHtml(text('logs.subscribe.start', 'Start realtime'))}</button>
				<button type="button" data-logs-action="clear" class="mcpv-button">${escapeHtml(text('logs.clear', 'Clear'))}</button>
			</div>
			<p class="mcpv-logs__status" id="mcpv-logs-status" role="status" aria-live="polite">${escapeHtml(text('logs.subscribe.idle', 'Realtime paused'))}</p>
		</form>
		<ol class="mcpv-logs__list" id="mcpv-logs-list" aria-live="polite"></ol>
		<p class="mcpv-logs__empty" id="mcpv-logs-empty">${escapeHtml(text('logs.empty', 'No log events match the current filter.'))}</p>
		<div class="mcpv-logs__detail" id="mcpv-logs-detail" hidden role="dialog" aria-modal="true" aria-labelledby="mcpv-logs-detail-title">
			<header class="mcpv-logs__detail-head">
				<h3 id="mcpv-logs-detail-title"></h3>
				<button type="button" class="mcpv-button" data-logs-action="close-detail">×</button>
			</header>
			<dl class="mcpv-logs__detail-body" id="mcpv-logs-detail-body"></dl>
		</div>
	</div>
</section>`;
};

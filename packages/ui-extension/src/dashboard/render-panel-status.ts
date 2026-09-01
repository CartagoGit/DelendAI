/**
 * `renderPanelStatus` — primary entry panel for the dashboard.
 *
 * Re-uses the same model as Overview + Health + Agents so the data is
 * already cached and consistent: it surfaces the live MCP server
 * identity, connection state, agents, locks, queue depth, last
 * recommended next action and a quick action ribbon. The UI is a
 * card grid with a "current activity" callout that animates when a
 * new MCP call is in flight (server signals `hostStatusPulse`).
 */
import type { IDashboardAllModels } from '@mcp-vertex/client';
import type { ILangDict } from '@mcp-vertex/shared/i18n';

import { extensionText } from '../i18n/extension-text';
import { escapeHtml, formatMs, formatNumber } from './format';
import { sparklinePath } from './sparkline';
import { progressRing } from './progress-ring';

const renderServerIdentity = (
	model: IDashboardAllModels,
	text: (key: string, fallback: string) => string,
): string => {
	const { overview } = model;
	const connection =
		overview.serverVersion === 'unavailable'
			? text('status.connectionLost', 'lost')
			: text('status.connectionOk', 'connected');
	const recommended = overview.recommendedNextAction;
	return `<div class="mcpv-status__identity">
		<div class="mcpv-status__pulse" data-state="${overview.serverVersion === 'unavailable' ? 'lost' : 'ok'}" aria-hidden="true"></div>
		<div>
			<h3>${escapeHtml(text('status.serverLabel', 'Server'))}: <code>${escapeHtml(overview.serverName)}</code></h3>
			<p class="mcpv-fg-muted">
				${escapeHtml(text('status.versionLabel', 'Version'))}: <code>${escapeHtml(overview.serverVersion)}</code> ·
				${escapeHtml(text('status.namespacePrefix', 'Namespace'))}: <code>${escapeHtml(overview.namespacePrefix)}</code>
			</p>
			<p>
				<span class="mcpv-status__chip" data-state="${overview.serverVersion === 'unavailable' ? 'lost' : 'ok'}">${escapeHtml(text('status.connection', 'MCP connection'))}: ${escapeHtml(connection)}</span>
			</p>
		</div>
	</div>
	<details class="mcpv-status__action" open>
		<summary>${escapeHtml(text('status.recommendedNextAction', 'Recommended next action'))}</summary>
		<pre>${escapeHtml(recommended)}</pre>
	</details>`;
};

const renderCurrentActivity = (
	model: IDashboardAllModels,
	text: (key: string, fallback: string) => string,
): string => {
	const activeAgents = model.agents.agents.filter((agent) => {
		const lastHeartbeat = agent.lastHeartbeat;
		if (typeof lastHeartbeat !== 'string') return false;
		const last = Date.parse(lastHeartbeat);
		return Number.isFinite(last) && Date.now() - last < 5 * 60 * 1000;
	});
	if (activeAgents.length === 0) {
		return `<div class="mcpv-status__activity mcpv-status__activity--idle">
			<p>${escapeHtml(text('status.noCurrentAction', 'No MCP call is in flight right now.'))}</p>
		</div>`;
	}
	return `<div class="mcpv-status__activity">
		<p><strong>${escapeHtml(text('status.activeAgents', 'Active agents'))}:</strong> ${escapeHtml(formatNumber(activeAgents.length))}</p>
		<ul>
			${activeAgents
				.map((agent) => {
					const proposal =
						typeof agent.currentProposal === 'string'
							? agent.currentProposal
							: '';
					const slice = agent.currentSlice ?? '';
					return `<li>
						<code>${escapeHtml(agent.name)}</code>
						${proposal ? ` · ${escapeHtml(text('dashboard.agents.currentProposal', 'Current proposal'))} <code>${escapeHtml(proposal)}</code>` : ''}
						${slice ? ` · ${escapeHtml(text('dashboard.agents.slice', 'Slice'))} <code>${escapeHtml(slice)}</code>` : ''}
					</li>`;
				})
				.join('')}
		</ul>
	</div>`;
};

const renderKpis = (
	model: IDashboardAllModels,
	text: (key: string, fallback: string) => string,
): string => {
	const totals = model.overview.totals;
	const tokensSavedPercent = Math.max(
		0,
		Math.min(100, totals.savingsPercent),
	);
	const tokensRingPath = progressRing(tokensSavedPercent, 100, 64);
	const errorRate =
		totals.calls > 0 ? Math.round((totals.errors / totals.calls) * 100) : 0;
	const errorRingPath = progressRing(Math.min(errorRate, 100), 100, 64);
	const cards: Array<{ label: string; value: string; hint: string }> = [
		{
			label: text('status.toolsLabel', 'Tools'),
			value: formatNumber(totals.tools),
			hint: text('status.pluginsLabel', 'Plugins'),
		},
		{
			label: text('status.pluginsLabel', 'Plugins'),
			value: formatNumber(totals.plugins),
			hint: text('status.callsLabel', 'Total calls'),
		},
		{
			label: text('status.callsLabel', 'Total calls'),
			value: formatNumber(totals.calls),
			hint: text('status.errorsLabel', 'Errors'),
		},
		{
			label: text('status.errorsLabel', 'Errors'),
			value: formatNumber(totals.errors),
			hint: text('status.lastHeartbeat', 'Last heartbeat'),
		},
		{
			label: text('status.activeLocks', 'Active locks'),
			value: formatNumber(model.health.locksActive),
			hint: text('status.queueDepth', 'Queue depth'),
		},
		{
			label: text('status.staleAgents', 'Stale agents'),
			value: formatNumber(model.health.staleCount),
			hint: text('dashboard.health.threshold', 'Threshold'),
		},
	];
	const ringCard = (
		title: string,
		percent: number,
		arc: string,
		colour: string,
		caption: string,
	): string => `<article class="mcpv-status__ring">
		<h4>${escapeHtml(title)}</h4>
		<svg viewBox="0 0 64 64" class="mcpv-status__ring-svg" role="img" aria-label="${escapeHtml(title)}">
			<circle cx="32" cy="32" r="28" stroke="var(--mcpv-bg-soft)" stroke-width="6" fill="none" />
			${
				arc.length > 0
					? `<path d="${arc}" stroke="${colour}" stroke-width="6" fill="none" stroke-linecap="round" />`
					: ''
			}
			<text x="32" y="38" text-anchor="middle" font-size="14" font-weight="700" fill="currentColor">${percent}%</text>
		</svg>
		<p class="mcpv-kpi__hint">${escapeHtml(caption)}</p>
	</article>`;
	return `<div class="mcpv-status__kpis">
		${ringCard(
			text('dashboard.tokens.savings', 'Savings'),
			tokensSavedPercent,
			tokensRingPath,
			'var(--mcpv-brand-purple)',
			text(
				'dashboard.tokens.savedHint',
				'Tokens saved vs compact:false baseline',
			),
		)}
		${ringCard(
			text('dashboard.metrics.totalErrors', 'Errors'),
			errorRate,
			errorRingPath,
			'var(--mcpv-error)',
			text('dashboard.metrics.totalErrors', 'Errors as % of total calls'),
		)}
		${cards
			.map(
				(card) => `<article class="mcpv-status__kpi">
					<h4>${escapeHtml(card.label)}</h4>
					<p class="mcpv-kpi__value">${escapeHtml(card.value)}</p>
					<p class="mcpv-kpi__hint">${escapeHtml(card.hint)}</p>
				</article>`,
			)
			.join('')}
	</div>`;
};

const renderLatency = (
	model: IDashboardAllModels,
	text: (key: string, fallback: string) => string,
): string => {
	const { times, metrics } = model;
	const samples = metrics.sparklines['mcp-vertex_overview'] ?? [];
	const sparkPath = sparklinePath(samples, 240, 36);
	return `<article class="mcpv-status__panel">
		<h4>${escapeHtml(text('dashboard.times.totalWall', 'Total wall'))}</h4>
		<p class="mcpv-kpi__value">${escapeHtml(formatMs(times.totalWallMs))}</p>
		<dl class="mcpv-kv">
			<dt>${escapeHtml(text('dashboard.times.p50Latency', 'p50 latency'))}</dt>
			<dd>${escapeHtml(formatMs(times.p50Ms))}</dd>
			<dt>${escapeHtml(text('dashboard.times.p95Latency', 'p95 latency'))}</dt>
			<dd>${escapeHtml(formatMs(times.p95Ms))}</dd>
			<dt>${escapeHtml(text('dashboard.times.slowestTool', 'Slowest tool'))}</dt>
			<dd><code>${escapeHtml(times.slowestTool?.tool ?? '—')}</code> · ${escapeHtml(formatMs(times.slowestTool?.maxMs ?? 0))}</dd>
		</dl>
		${
			sparkPath.length > 0
				? `<svg class="mcpv-status__sparkline" viewBox="0 0 240 36" preserveAspectRatio="none" aria-label="${text('dashboard.times.sparkline', 'latency trend')}" role="img">
				<path d="${sparkPath}" fill="none" stroke="currentColor" stroke-width="1.5" />
			</svg>`
				: ''
		}
	</article>`;
};

const renderAgents = (
	model: IDashboardAllModels,
	text: (key: string, fallback: string) => string,
): string => {
	const rows = model.agents.agents;
	if (rows.length === 0) {
		return `<p class="mcpv-fg-muted">${escapeHtml(text('dashboard.agents.none', 'No active agents.'))}</p>`;
	}
	return `<table class="mcpv-table">
		<thead><tr>
			<th>${escapeHtml(text('common.agent', 'Agent'))}</th>
			<th>${escapeHtml(text('status.lastHeartbeat', 'Last heartbeat'))}</th>
			<th>${escapeHtml(text('dashboard.agents.currentProposal', 'Current proposal'))}</th>
			<th>${escapeHtml(text('dashboard.agents.slice', 'Slice'))}</th>
		</tr></thead>
		<tbody>${rows
			.map(
				(agent) => `<tr>
				<td><code>${escapeHtml(agent.name)}</code></td>
				<td class="mcpv-fg-muted">${escapeHtml(agent.lastHeartbeat ?? '—')}</td>
				<td>${typeof agent.currentProposal === 'string' ? `<code>${escapeHtml(agent.currentProposal)}</code>` : '—'}</td>
				<td>${agent.currentSlice !== undefined ? `<code>${escapeHtml(agent.currentSlice)}</code>` : '—'}</td>
			</tr>`,
			)
			.join('')}</tbody>
	</table>`;
};

export const renderPanelStatus = (
	model: IDashboardAllModels,
	lang: ILangDict,
): string => {
	const text = (key: string, fallback: string): string =>
		extensionText(lang, key) || fallback;
	return `<section class="mcpv-panel" id="panel-status" role="tabpanel" aria-labelledby="tab-status">
	<h2 class="mcpv-panel__title">${escapeHtml(text('tabStatus', 'Status'))}</h2>
	<p class="mcpv-fg-muted">${escapeHtml(text('status.headline', 'Live state of the mcp-vertex MCP server.'))}</p>
	<div class="mcpv-status">
		${renderServerIdentity(model, text)}
		${renderKpis(model, text)}
		<div class="mcpv-status__row">
			${renderCurrentActivity(model, text)}
			${renderLatency(model, text)}
		</div>
		<article class="mcpv-status__panel mcpv-status__panel--wide">
			<h4>${escapeHtml(text('status.activeAgents', 'Active agents'))}</h4>
			${renderAgents(model, text)}
		</article>
	</div>
</section>`;
};

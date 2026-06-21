/**
 * `renderPanelHealth` — IDE-agnostic HTML for the Health panel
 * (S4b in f126). Pure function, no host imports.
 */
import type { IHealthSnapshot } from '@mcp-vertex/client';

import { escapeHtml, formatMs, formatNumber } from './format';

const renderQueue = (queue: IHealthSnapshot['queue']): string => {
	if (queue === null) {
		return '<p class="mv-fg-muted">No queue configured.</p>';
	}
	return `<dl class="mv-kv">
		<dt>Length</dt><dd>${formatNumber(queue.length)}</dd>
		<dt>Queued</dt><dd>${formatNumber(queue.queued)}</dd>
		<dt>Waiter orphans</dt><dd>${formatNumber(queue.orphans)}</dd>
		<dt>Oldest age</dt><dd>${formatMs(queue.oldestAgeMinutes * 60_000)}</dd>
		<dt>Threshold</dt><dd><code>${escapeHtml(queue.threshold)}</code></dd>
	</dl>`;
};

const renderStaleRows = (
	stale: ReadonlyArray<IHealthSnapshot['stale'][number]>,
): string => {
	if (stale.length === 0) {
		return '<p class="mv-fg-muted">No stale agents.</p>';
	}
	return `<table class="mv-table">
		<thead><tr><th>Agent</th><th>Task</th><th>Kind</th><th>Missed</th><th>Last seen</th><th>Suggested</th></tr></thead>
		<tbody>${stale
			.map(
				(s) => `<tr>
				<td><code>${escapeHtml(s.agent)}</code></td>
				<td><code>${escapeHtml(s.taskId)}</code></td>
				<td>${escapeHtml(s.kind)}</td>
				<td class="mv-num">${formatNumber(s.missedBeats)}</td>
				<td class="mv-fg-muted">${escapeHtml(s.lastSeen)}</td>
				<td>${s.suggestedActions.map((a) => `<code>${escapeHtml(a)}</code>`).join(' ')}</td>
			</tr>`,
			)
			.join('')}</tbody>
	</table>`;
};

export const renderPanelHealth = (model: IHealthSnapshot): string => `
<section class="mv-panel" id="panel-health" role="tabpanel" aria-labelledby="tab-health">
	<h2 class="mv-panel__title">Health</h2>
	<div class="mv-grid">
		<div class="mv-card mv-card--third">
			<h3 class="mv-card__title">Status</h3>
			<p class="mv-kpi__value" data-healthy="${model.healthy}">
				${model.healthy ? 'Healthy' : 'Degraded'}
			</p>
			<p class="mv-kpi__hint">fetched ${escapeHtml(model.fetchedAt)}</p>
		</div>
		<div class="mv-card mv-card--third">
			<h3 class="mv-card__title">Locks</h3>
			<p class="mv-kpi__value">${formatNumber(model.locksActive)}</p>
			<p class="mv-kpi__hint">active proposal locks</p>
		</div>
		<div class="mv-card mv-card--third">
			<h3 class="mv-card__title">Stale agents</h3>
			<p class="mv-kpi__value">${formatNumber(model.staleCount)}</p>
			<p class="mv-kpi__hint">threshold ${escapeHtml(model.orphansThreshold)}</p>
		</div>
		<div class="mv-card mv-card--half">
			<h3 class="mv-card__title">Queue</h3>
			${renderQueue(model.queue)}
		</div>
		<div class="mv-card mv-card--half">
			<h3 class="mv-card__title">Active agents</h3>
			${model.agents.length === 0 ? '<p class="mv-fg-muted">No active agents.</p>' : `<ul>${model.agents.map((a) => `<li><code>${escapeHtml(a)}</code></li>`).join('')}</ul>`}
		</div>
		<div class="mv-card">
			<h3 class="mv-card__title">Stale</h3>
			${renderStaleRows(model.stale)}
		</div>
	</div>
</section>
`;

/**
 * `renderPanelHealth` — IDE-agnostic HTML for the Health panel
 * (S4b in f126). Pure function, no host imports.
 */
import type { IHealthSnapshot } from '@delendai/client';
import type { ILangDict } from '@delendai/shared/i18n';

import { extensionText } from '../i18n/extension-text';
import { escapeHtml, formatMs, formatNumber } from './format';

const renderQueue = (
	queue: IHealthSnapshot['queue'],
	lang: ILangDict,
): string => {
	const text = (key: string) => extensionText(lang, key);
	if (queue === null) {
		return `<p class="mcpv-fg-muted">${escapeHtml(text('dashboard.health.noneQueue'))}</p>`;
	}
	return `<dl class="mcpv-kv">
		<dt>${escapeHtml(text('dashboard.health.queueLength'))}</dt><dd>${formatNumber(queue.length)}</dd>
		<dt>${escapeHtml(text('dashboard.health.queued'))}</dt><dd>${formatNumber(queue.queued)}</dd>
		<dt>${escapeHtml(text('dashboard.health.waiterOrphans'))}</dt><dd>${formatNumber(queue.orphans)}</dd>
		<dt>${escapeHtml(text('dashboard.health.oldestAge'))}</dt><dd>${formatMs(queue.oldestAgeMinutes * 60_000)}</dd>
		<dt>${escapeHtml(text('dashboard.health.threshold'))}</dt><dd><code>${escapeHtml(queue.threshold)}</code></dd>
	</dl>`;
};

const renderStaleRows = (
	stale: ReadonlyArray<IHealthSnapshot['stale'][number]>,
	lang: ILangDict,
): string => {
	const text = (key: string) => extensionText(lang, key);
	if (stale.length === 0) {
		return `<p class="mcpv-fg-muted">${escapeHtml(text('dashboard.health.noneStaleAgents'))}</p>`;
	}
	return `<table class="mcpv-table">
		<thead><tr><th>${escapeHtml(text('common.agent'))}</th><th>${escapeHtml(text('common.task'))}</th><th>${escapeHtml(text('common.kind'))}</th><th>${escapeHtml(text('common.missed'))}</th><th>${escapeHtml(text('common.lastSeen'))}</th><th>${escapeHtml(text('dashboard.health.suggested'))}</th></tr></thead>
		<tbody>${stale
			.map(
				(s) => `<tr>
				<td><code>${escapeHtml(s.agent)}</code></td>
				<td><code>${escapeHtml(s.taskId)}</code></td>
				<td>${escapeHtml(s.kind)}</td>
				<td class="mcpv-num">${formatNumber(s.missedBeats)}</td>
				<td class="mcpv-fg-muted">${escapeHtml(s.lastSeen)}</td>
				<td>${s.suggestedActions.map((a) => `<code>${escapeHtml(a)}</code>`).join(' ')}</td>
			</tr>`,
			)
			.join('')}</tbody>
	</table>`;
};

export const renderPanelHealth = (
	model: IHealthSnapshot,
	lang: ILangDict,
): string => {
	const text = (key: string) => extensionText(lang, key);
	return `
<section class="mcpv-panel" id="panel-health" role="tabpanel" aria-labelledby="tab-health">
	<h2 class="mcpv-panel__title">${escapeHtml(text('tabHealth'))}</h2>
	<div class="mcpv-grid">
		<div class="mcpv-card mcpv-card--third">
			<h3 class="mcpv-card__title">${escapeHtml(text('dashboard.health.status'))}</h3>
			<p class="mcpv-kpi__value" data-healthy="${model.healthy}">
				${escapeHtml(model.healthy ? text('healthHealthy') : text('healthDegraded'))}
			</p>
			<p class="mcpv-kpi__hint">${escapeHtml(text('dashboard.health.fetchedAt'))} ${escapeHtml(model.fetchedAt)}</p>
		</div>
		<div class="mcpv-card mcpv-card--third">
			<h3 class="mcpv-card__title">${escapeHtml(text('healthLocks'))}</h3>
			<p class="mcpv-kpi__value">${formatNumber(model.locksActive)}</p>
			<p class="mcpv-kpi__hint">${escapeHtml(text('dashboard.health.activeProposalLocks'))}</p>
		</div>
		<div class="mcpv-card mcpv-card--third">
			<h3 class="mcpv-card__title">${escapeHtml(text('healthStale'))}</h3>
			<p class="mcpv-kpi__value">${formatNumber(model.staleCount)}</p>
			<p class="mcpv-kpi__hint">${escapeHtml(text('dashboard.health.threshold'))} ${escapeHtml(model.orphansThreshold)}</p>
		</div>
		<div class="mcpv-card mcpv-card--half">
			<h3 class="mcpv-card__title">${escapeHtml(text('healthQueue'))}</h3>
			${renderQueue(model.queue, lang)}
		</div>
		<div class="mcpv-card mcpv-card--half">
			<h3 class="mcpv-card__title">${escapeHtml(text('dashboard.health.activeAgents'))}</h3>
			${model.agents.length === 0 ? `<p class="mcpv-fg-muted">${escapeHtml(text('dashboard.health.noneActiveAgents'))}</p>` : `<ul>${model.agents.map((a) => `<li><code>${escapeHtml(a)}</code></li>`).join('')}</ul>`}
		</div>
		<div class="mcpv-card">
			<h3 class="mcpv-card__title">${escapeHtml(text('healthStale'))}</h3>
			${renderStaleRows(model.stale, lang)}
		</div>
	</div>
</section>
`;
};

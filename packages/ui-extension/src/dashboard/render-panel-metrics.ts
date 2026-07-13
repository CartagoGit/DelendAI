/**
 * `renderPanelMetrics` — per-tool KPIs + total/max latency + sparkline.
 */
import type { IDashboardMetricsModel } from '@mcp-vertex/client';
import type { ILangDict } from '@mcp-vertex/shared/i18n';

import { extensionText } from '../i18n/extension-text';
import { escapeHtml, formatMs, formatNumber } from './format';
import { sparklinePath } from './sparkline';

export const renderPanelMetrics = (
	model: IDashboardMetricsModel,
	lang: ILangDict,
): string => {
	const text = (key: string) => extensionText(lang, key);
	const top = model.rows.slice(0, 8);
	const sparkW = 120;
	const sparkH = 28;
	return `
<section class="mcpv-panel" id="panel-metrics" role="tabpanel" aria-labelledby="tab-metrics">
	<h2 class="mcpv-panel__title">${escapeHtml(text('tabMetrics'))}</h2>
	<div class="mcpv-grid">
		<div class="mcpv-card mcpv-card--third">
			<h3 class="mcpv-card__title">${escapeHtml(text('dashboard.metrics.totalCalls'))}</h3>
			<p class="mcpv-kpi__value">${formatNumber(model.totals.calls)}</p>
		</div>
		<div class="mcpv-card mcpv-card--third">
			<h3 class="mcpv-card__title">${escapeHtml(text('dashboard.metrics.totalErrors'))}</h3>
			<p class="mcpv-kpi__value">${formatNumber(model.totals.errors)}</p>
		</div>
		<div class="mcpv-card mcpv-card--third">
			<h3 class="mcpv-card__title">${escapeHtml(text('dashboard.metrics.totalLatency'))}</h3>
			<p class="mcpv-kpi__value">${formatMs(model.totals.totalMs)}</p>
		</div>
		<div class="mcpv-card">
			<h3 class="mcpv-card__title">${escapeHtml(text('dashboard.metrics.topTools'))}</h3>
			<table class="mcpv-table">
				<thead><tr><th>${escapeHtml(text('common.tool'))}</th><th>${escapeHtml(text('common.plugin'))}</th><th>${escapeHtml(text('common.calls'))}</th><th>${escapeHtml(text('common.errors'))}</th><th>${escapeHtml(text('common.avg'))}</th><th>${escapeHtml(text('common.max'))}</th><th>${escapeHtml(text('common.trend'))}</th></tr></thead>
				<tbody>
				${top
					.map((r) => {
						const samples = model.sparklines[r.tool] ?? [
							r.avgMs,
							r.avgMs,
							r.avgMs,
							r.avgMs,
							r.avgMs,
							r.avgMs,
						];
						const d = sparklinePath(samples, sparkW, sparkH);
						return `<tr>
							<td><code>${escapeHtml(r.tool)}</code></td>
							<td><code>${escapeHtml(r.plugin)}</code></td>
							<td>${formatNumber(r.calls)}</td>
							<td>${formatNumber(r.errors)}</td>
							<td>${formatMs(r.avgMs)}</td>
							<td>${formatMs(r.maxMs)}</td>
							<td><svg class="mcpv-sparkline" viewBox="0 0 ${sparkW} ${sparkH}" xmlns="http://www.w3.org/2000/svg"><path d="${d}" fill="none" stroke="var(--mcpv-brand-purple)" stroke-width="1.5"/></svg></td>
						</tr>`;
					})
					.join('')}
				</tbody>
			</table>
			<p class="mcpv-fg-muted">${escapeHtml(text('dashboard.metrics.collectedAt'))} ${escapeHtml(model.collectedAt)}</p>
		</div>
	</div>
</section>
`;
};

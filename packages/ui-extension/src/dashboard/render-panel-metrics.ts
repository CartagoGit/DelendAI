/**
 * `renderPanelMetrics` — per-tool KPIs + total/max latency + sparkline.
 */
import type { IDashboardMetricsModel } from '@delendai/client';
import type { ILangDict } from '@delendai/shared/i18n';

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
<section class="delendai-panel" id="panel-metrics" role="tabpanel" aria-labelledby="tab-metrics">
	<h2 class="delendai-panel__title">${escapeHtml(text('tabMetrics'))}</h2>
	<div class="delendai-grid">
		<div class="delendai-card delendai-card--third">
			<h3 class="delendai-card__title">${escapeHtml(text('dashboard.metrics.totalCalls'))}</h3>
			<p class="delendai-kpi__value">${formatNumber(model.totals.calls)}</p>
		</div>
		<div class="delendai-card delendai-card--third">
			<h3 class="delendai-card__title">${escapeHtml(text('dashboard.metrics.totalErrors'))}</h3>
			<p class="delendai-kpi__value">${formatNumber(model.totals.errors)}</p>
		</div>
		<div class="delendai-card delendai-card--third">
			<h3 class="delendai-card__title">${escapeHtml(text('dashboard.metrics.totalLatency'))}</h3>
			<p class="delendai-kpi__value">${formatMs(model.totals.totalMs)}</p>
		</div>
		<div class="delendai-card">
			<h3 class="delendai-card__title">${escapeHtml(text('dashboard.metrics.topTools'))}</h3>
			<table class="delendai-table">
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
							<td><svg class="delendai-sparkline" viewBox="0 0 ${sparkW} ${sparkH}" xmlns="http://www.w3.org/2000/svg"><path d="${d}" fill="none" stroke="var(--delendai-brand-purple)" stroke-width="1.5"/></svg></td>
						</tr>`;
					})
					.join('')}
				</tbody>
			</table>
			<p class="delendai-fg-muted">${escapeHtml(text('dashboard.metrics.collectedAt'))} ${escapeHtml(model.collectedAt)}</p>
		</div>
	</div>
</section>
`;
};

/**
 * `renderPanelMetrics` — per-tool KPIs + total/max latency + sparkline.
 */
import type { IDashboardMetricsModel } from '@mcp-vertex/client';

import { escapeHtml, formatMs, formatNumber } from './format';
import { sparklinePath } from './sparkline';

export const renderPanelMetrics = (model: IDashboardMetricsModel): string => {
	const top = model.rows.slice(0, 8);
	const sparkW = 120;
	const sparkH = 28;
	return `
<section class="mv-panel" id="panel-metrics" role="tabpanel" aria-labelledby="tab-metrics">
	<h2 class="mv-panel__title">Metrics</h2>
	<div class="mv-grid">
		<div class="mv-card mv-card--third">
			<h3 class="mv-card__title">Total calls</h3>
			<p class="mv-kpi__value">${formatNumber(model.totals.calls)}</p>
		</div>
		<div class="mv-card mv-card--third">
			<h3 class="mv-card__title">Total errors</h3>
			<p class="mv-kpi__value">${formatNumber(model.totals.errors)}</p>
		</div>
		<div class="mv-card mv-card--third">
			<h3 class="mv-card__title">Total latency</h3>
			<p class="mv-kpi__value">${formatMs(model.totals.totalMs)}</p>
		</div>
		<div class="mv-card">
			<h3 class="mv-card__title">Top 8 tools</h3>
			<table class="mv-table">
				<thead><tr><th>Tool</th><th>Plugin</th><th>Calls</th><th>Errors</th><th>Avg</th><th>Max</th><th>Trend</th></tr></thead>
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
							<td><svg class="mv-sparkline" viewBox="0 0 ${sparkW} ${sparkH}" xmlns="http://www.w3.org/2000/svg"><path d="${d}" fill="none" stroke="var(--mv-brand-purple)" stroke-width="1.5"/></svg></td>
						</tr>`;
					})
					.join('')}
				</tbody>
			</table>
			<p class="mv-fg-muted">Collected at ${escapeHtml(model.collectedAt)}</p>
		</div>
	</div>
</section>
`;
};

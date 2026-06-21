/**
 * `renderPanelTimes` — total wall-clock, slowest tool, p50/p95, histogram.
 */
import type { IDashboardTimesModel } from '@mcp-vertex/client';

import { escapeHtml, formatMs, formatNumber } from './format';
import { barChart } from './bar-chart';

export const renderPanelTimes = (model: IDashboardTimesModel): string => {
	const chart = barChart(
		model.histogram.map((b) => ({ label: b.bucket, value: b.count })),
		640,
		140,
	);
	const slowest = model.slowestTool;
	return `
<section class="mv-panel" id="panel-times" role="tabpanel" aria-labelledby="tab-times">
	<h2 class="mv-panel__title">Times</h2>
	<div class="mv-grid">
		<div class="mv-card mv-card--third">
			<h3 class="mv-card__title">Total wall</h3>
			<p class="mv-kpi__value">${formatMs(model.totalWallMs)}</p>
		</div>
		<div class="mv-card mv-card--third">
			<h3 class="mv-card__title">p50 latency</h3>
			<p class="mv-kpi__value">${formatMs(model.p50Ms)}</p>
		</div>
		<div class="mv-card mv-card--third">
			<h3 class="mv-card__title">p95 latency</h3>
			<p class="mv-kpi__value">${formatMs(model.p95Ms)}</p>
		</div>
		<div class="mv-card">
			<h3 class="mv-card__title">Histogram</h3>
			${chart}
			<p class="mv-fg-muted">${formatNumber(model.histogram.reduce((s, b) => s + b.count, 0))} tool buckets</p>
		</div>
		${slowest === undefined ? '' : `<div class="mv-card"><h3 class="mv-card__title">Slowest tool</h3><p><code>${escapeHtml(slowest.tool)}</code> — ${formatMs(slowest.maxMs)}</p></div>`}
	</div>
</section>
`;
};

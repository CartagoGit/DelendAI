/**
 * `renderPanelTimes` — total wall-clock, slowest tool, p50/p95, histogram.
 */
import type { IDashboardTimesModel } from '@mcp-vertex/client';
import type { ILangDict } from '@mcp-vertex/shared/i18n';

import { extensionText } from '../i18n/extension-text';
import { escapeHtml, formatMs, formatNumber } from './format';
import { barChart } from './bar-chart';

export const renderPanelTimes = (
	model: IDashboardTimesModel,
	lang: ILangDict,
): string => {
	const text = (key: string, vars?: Readonly<Record<string, string | number>>) =>
		extensionText(lang, key, vars);
	const chart = barChart(
		model.histogram.map((b) => ({ label: b.bucket, value: b.count })),
		640,
		140,
		{ ariaLabel: text('tabTimes') },
	);
	const slowest = model.slowestTool;
	return `
<section class="mv-panel" id="panel-times" role="tabpanel" aria-labelledby="tab-times">
	<h2 class="mv-panel__title">${escapeHtml(text('tabTimes'))}</h2>
	<div class="mv-grid">
		<div class="mv-card mv-card--third">
			<h3 class="mv-card__title">${escapeHtml(text('dashboard.times.totalWall'))}</h3>
			<p class="mv-kpi__value">${formatMs(model.totalWallMs)}</p>
		</div>
		<div class="mv-card mv-card--third">
			<h3 class="mv-card__title">${escapeHtml(text('dashboard.times.p50Latency'))}</h3>
			<p class="mv-kpi__value">${formatMs(model.p50Ms)}</p>
		</div>
		<div class="mv-card mv-card--third">
			<h3 class="mv-card__title">${escapeHtml(text('dashboard.times.p95Latency'))}</h3>
			<p class="mv-kpi__value">${formatMs(model.p95Ms)}</p>
		</div>
		<div class="mv-card">
			<h3 class="mv-card__title">${escapeHtml(text('dashboard.times.histogram'))}</h3>
			${chart}
			<p class="mv-fg-muted">${escapeHtml(text('dashboard.times.toolBuckets', { count: formatNumber(model.histogram.reduce((s, b) => s + b.count, 0)) }))}</p>
		</div>
		${slowest === undefined ? '' : `<div class="mv-card"><h3 class="mv-card__title">${escapeHtml(text('dashboard.times.slowestTool'))}</h3><p><code>${escapeHtml(slowest.tool)}</code> — ${formatMs(slowest.maxMs)}</p></div>`}
	</div>
</section>
`;
};

/**
 * `renderPanelSpend` — real spend/cost telemetry from usage-tracking's
 * `usage_report` (f00118 S2): total cost, real tokens-saved, savings %,
 * and a cost-by-provider bar chart + table.
 *
 * `model` is `null` when usage-tracking is not loaded (or the call
 * failed) — the panel renders a plain unavailable message instead of a
 * broken chart, naming the plugin so the user knows how to unlock it.
 */
import type { IDashboardSpendModel } from '@delendai/client';
import type { ILangDict } from '@delendai/shared/i18n';

import { extensionText } from '../i18n/extension-text';
import { barChart } from './bar-chart';
import { escapeHtml, formatTokens } from './format';

const formatUsd = (value: number): string =>
	`$${value.toFixed(value < 10 ? 2 : 0)}`;

export const renderPanelSpend = (
	model: IDashboardSpendModel | null,
	lang: ILangDict,
): string => {
	const text = (
		key: string,
		vars?: Readonly<Record<string, string | number>>,
	) => extensionText(lang, key, vars);

	if (model === null) {
		return `
<section class="mcpv-panel" id="panel-spend" role="tabpanel" aria-labelledby="tab-spend">
	<h2 class="mcpv-panel__title">${escapeHtml(text('tabSpend'))}</h2>
	<div class="mcpv-card">
		<p class="mcpv-fg-muted">${escapeHtml(text('dashboard.spend.unavailable'))}</p>
	</div>
</section>
`;
	}

	const chart = barChart(
		model.byProvider.map((p) => ({ label: p.provider, value: p.costUsd })),
		640,
		140,
		{ ariaLabel: text('dashboard.spend.byProvider') },
	);
	const rows = model.byProvider
		.map(
			(p) => `<tr>
				<td><code>${escapeHtml(p.provider)}</code></td>
				<td class="mcpv-num">${formatUsd(p.costUsd)}</td>
				<td class="mcpv-num">${p.calls}</td>
			</tr>`,
		)
		.join('');

	return `
<section class="mcpv-panel" id="panel-spend" role="tabpanel" aria-labelledby="tab-spend">
	<h2 class="mcpv-panel__title">${escapeHtml(text('tabSpend'))} — ${escapeHtml(text('dashboard.spend.window', { days: model.windowDays }))}</h2>
	<div class="mcpv-grid">
		<div class="mcpv-card mcpv-card--third">
			<h3 class="mcpv-card__title">${escapeHtml(text('dashboard.spend.totalCost'))}</h3>
			<p class="mcpv-kpi__value">${formatUsd(model.totalCostUsd)}</p>
		</div>
		<div class="mcpv-card mcpv-card--third">
			<h3 class="mcpv-card__title">${escapeHtml(text('dashboard.spend.tokensSaved'))}</h3>
			<p class="mcpv-kpi__value">${formatTokens(model.totalTokensSaved)}</p>
		</div>
		<div class="mcpv-card mcpv-card--third">
			<h3 class="mcpv-card__title">${escapeHtml(text('dashboard.spend.savings'))}</h3>
			<p class="mcpv-kpi__value">${model.savingsPercent}%</p>
		</div>
		<div class="mcpv-card">
			<h3 class="mcpv-card__title">${escapeHtml(text('dashboard.spend.byProvider'))}</h3>
			${chart}
			<table class="mcpv-table">
				<thead><tr><th>${escapeHtml(text('common.plugin'))}</th><th>${escapeHtml(text('dashboard.spend.totalCost'))}</th><th>${escapeHtml(text('common.calls'))}</th></tr></thead>
				<tbody>${rows}</tbody>
			</table>
		</div>
	</div>
</section>
`;
};

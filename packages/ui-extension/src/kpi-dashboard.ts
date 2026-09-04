import { dashboardCss } from '@delendai/shared/styles/dashboard/dashboard-css';

import { renderHeaderBar, componentCss } from './components';
import {
	escapeHtml,
	formatDate,
	formatMs,
	formatNumber,
	formatTokens,
} from './dashboard/format';

export const KPI_DASHBOARD_VIEW_STATES = [
	'loading',
	'ready',
	'partial',
	'unavailable',
	'disconnected',
	'empty',
] as const;

export type TKpiDashboardViewState = (typeof KPI_DASHBOARD_VIEW_STATES)[number];

export const KPI_DASHBOARD_METRIC_STATUSES = [
	'measured',
	'estimated',
	'partial',
	'unavailable',
	'not-configured',
	'provider-reported',
	'configured-estimate',
	'subscription',
] as const;

export type TKpiDashboardMetricStatus =
	(typeof KPI_DASHBOARD_METRIC_STATUSES)[number];

export const KPI_DASHBOARD_METRIC_UNITS = [
	'score',
	'count',
	'ratio',
	'tokens',
	'usd',
	'bytes',
	'ms',
] as const;

export type TKpiDashboardMetricUnit =
	(typeof KPI_DASHBOARD_METRIC_UNITS)[number];

export interface IKpiDashboardWindowOption {
	readonly days: number;
	readonly label: string;
	readonly selected: boolean;
}

export interface IKpiDashboardMetric {
	readonly key: string;
	readonly label: string;
	readonly status: TKpiDashboardMetricStatus;
	readonly unit: TKpiDashboardMetricUnit;
	readonly source: string;
	readonly value?: number;
	readonly observedAt?: string;
	readonly note?: string;
}

export interface IKpiDashboardTrendPoint {
	readonly at: string;
	readonly label: string;
	readonly value?: number;
	readonly status: TKpiDashboardMetricStatus;
}

export interface IKpiDashboardTrendSeries {
	readonly key: string;
	readonly label: string;
	readonly unit: TKpiDashboardMetricUnit;
	readonly status: TKpiDashboardMetricStatus;
	readonly points: readonly IKpiDashboardTrendPoint[];
	readonly note?: string;
}

export interface IKpiDashboardTrendCard {
	readonly id: string;
	readonly title: string;
	readonly state: TKpiDashboardViewState;
	readonly note?: string;
	readonly series: readonly IKpiDashboardTrendSeries[];
}

export interface IKpiDashboardRowValue {
	readonly label: string;
	readonly value: string;
	readonly tone?: 'default' | 'muted' | 'danger';
}

export interface IKpiDashboardRow {
	readonly key: string;
	readonly label: string;
	readonly subtitle?: string;
	readonly state: TKpiDashboardViewState;
	readonly values: readonly IKpiDashboardRowValue[];
	readonly note?: string;
}

export interface IKpiDashboardSection {
	readonly id:
		| 'health'
		| 'delivery'
		| 'quality-coverage'
		| 'usage'
		| 'cost'
		| 'models'
		| 'agents'
		| 'plugins'
		| 'errors'
		| 'efficiency'
		| 'audit'
		| 'activation';
	readonly title: string;
	readonly icon: string;
	readonly state: TKpiDashboardViewState;
	readonly note?: string;
	readonly metrics: readonly IKpiDashboardMetric[];
	readonly rows: readonly IKpiDashboardRow[];
}

export interface IKpiDashboardRecommendation {
	readonly tool: string;
	readonly priority: 'now' | 'next' | 'later';
	readonly reason: string;
}

export interface IKpiDashboardModel {
	readonly title: string;
	readonly state: TKpiDashboardViewState;
	readonly summary: string;
	readonly windowLabel: string;
	readonly selectedWindowDays: number;
	readonly windows: readonly IKpiDashboardWindowOption[];
	readonly generatedAt?: string;
	readonly summaryMetrics: readonly IKpiDashboardMetric[];
	readonly trends: readonly IKpiDashboardTrendCard[];
	readonly sections: readonly IKpiDashboardSection[];
	readonly recommendations: readonly IKpiDashboardRecommendation[];
	readonly limitations: readonly string[];
	readonly errors: readonly string[];
}

export interface IRenderKpiDashboardOptions {
	readonly brandName?: string;
	readonly version?: string;
}

const STYLE = `<style>
body {
	margin: 0;
	padding: 0;
	font-family: var(--vscode-font-family);
	color: var(--vscode-foreground);
	background: var(--vscode-editor-background);
}

.mcpv-kpi-dashboard {
	padding: 1rem;
	display: grid;
	gap: 1rem;
}

.mcpv-kpi-dashboard .mcpv-header {
	margin-bottom: 0;
}

.mcpv-kpi-toolbar {
	display: flex;
	flex-wrap: wrap;
	justify-content: space-between;
	gap: 0.75rem;
	align-items: center;
	padding: 0.85rem 1rem;
	border: 1px solid var(--vscode-widget-border, #8884);
	border-radius: 12px;
	background: var(--vscode-sideBar-background, var(--vscode-editor-background));
}

.mcpv-kpi-toolbar__group {
	display: flex;
	flex-wrap: wrap;
	gap: 0.5rem;
	align-items: center;
}

.mcpv-kpi-button {
	border: 1px solid var(--vscode-widget-border, #8884);
	background: var(--vscode-button-secondaryBackground, transparent);
	color: var(--vscode-button-secondaryForeground, var(--vscode-foreground));
	border-radius: 999px;
	padding: 0.38rem 0.75rem;
	font: inherit;
	cursor: pointer;
}

.mcpv-kpi-button[data-selected="true"] {
	background: color-mix(in srgb, var(--vscode-button-background, #0e639c) 18%, transparent);
	border-color: var(--vscode-button-background, #0e639c);
	color: var(--vscode-button-foreground, var(--vscode-foreground));
}

.mcpv-kpi-button:focus-visible {
	outline: 2px solid var(--vscode-focusBorder, #007fd4);
	outline-offset: 2px;
}

.mcpv-kpi-status {
	display: inline-flex;
	align-items: center;
	gap: 0.4rem;
	padding: 0.22rem 0.6rem;
	border-radius: 999px;
	font-size: 0.76rem;
	font-weight: 700;
	letter-spacing: 0.02em;
	text-transform: uppercase;
	border: 1px solid transparent;
}

.mcpv-kpi-status--ready {
	background: color-mix(in srgb, var(--vscode-charts-green, #2a9d3f) 18%, transparent);
	color: var(--vscode-charts-green, #2a9d3f);
	border-color: color-mix(in srgb, var(--vscode-charts-green, #2a9d3f) 40%, transparent);
}

.mcpv-kpi-status--partial,
.mcpv-kpi-status--loading {
	background: color-mix(in srgb, var(--vscode-charts-yellow, #e0a800) 18%, transparent);
	color: var(--vscode-charts-yellow, #a07800);
	border-color: color-mix(in srgb, var(--vscode-charts-yellow, #e0a800) 40%, transparent);
}

.mcpv-kpi-status--unavailable,
.mcpv-kpi-status--disconnected,
.mcpv-kpi-status--empty {
	background: color-mix(in srgb, var(--vscode-charts-red, #d64545) 14%, transparent);
	color: var(--vscode-charts-red, #d64545);
	border-color: color-mix(in srgb, var(--vscode-charts-red, #d64545) 28%, transparent);
}

.mcpv-kpi-banner,
.mcpv-kpi-card,
.mcpv-kpi-section,
.mcpv-kpi-trend {
	border: 1px solid var(--vscode-widget-border, #8884);
	border-radius: 12px;
	background: var(--vscode-sideBar-background, var(--vscode-editor-background));
	padding: 1rem;
}

.mcpv-kpi-banner {
	display: grid;
	gap: 0.35rem;
}

.mcpv-kpi-banner__summary {
	font-size: 0.95rem;
	font-weight: 600;
}

.mcpv-kpi-muted {
	color: var(--vscode-descriptionForeground);
	font-size: 0.84rem;
	line-height: 1.45;
}

.mcpv-kpi-grid,
.mcpv-kpi-trends,
.mcpv-kpi-sections {
	display: grid;
	gap: 1rem;
}

.mcpv-kpi-grid {
	grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
}

.mcpv-kpi-trends {
	grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
}

.mcpv-kpi-sections {
	grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
	align-items: start;
}

.mcpv-kpi-card__label,
.mcpv-kpi-metric__label,
.mcpv-kpi-row__meta,
.mcpv-kpi-trend__meta {
	font-size: 0.78rem;
	color: var(--vscode-descriptionForeground);
}

.mcpv-kpi-card__value,
.mcpv-kpi-metric__value {
	font-size: 1.15rem;
	font-weight: 700;
	margin-top: 0.3rem;
	display: block;
}

.mcpv-kpi-trend__head,
.mcpv-kpi-section__head,
.mcpv-kpi-foot__head {
	display: flex;
	justify-content: space-between;
	gap: 0.75rem;
	align-items: flex-start;
	margin-bottom: 0.75rem;
}

.mcpv-kpi-section__title,
.mcpv-kpi-trend__title,
.mcpv-kpi-foot__title {
	font-size: 0.98rem;
	font-weight: 700;
	margin: 0;
	display: inline-flex;
	gap: 0.45rem;
	align-items: center;
}

.mcpv-kpi-section__metrics {
	display: grid;
	grid-template-columns: repeat(auto-fit, minmax(120px, 1fr));
	gap: 0.75rem;
	margin-bottom: 0.9rem;
}

.mcpv-kpi-rowlist {
	display: grid;
	gap: 0.7rem;
}

.mcpv-kpi-row {
	border-top: 1px solid var(--vscode-widget-border, #8884);
	padding-top: 0.75rem;
	display: grid;
	gap: 0.4rem;
}

.mcpv-kpi-row:first-child {
	border-top: 0;
	padding-top: 0;
}

.mcpv-kpi-row__head {
	display: flex;
	justify-content: space-between;
	gap: 0.75rem;
	align-items: flex-start;
}

.mcpv-kpi-row__title {
	font-weight: 600;
	margin: 0;
	font-size: 0.9rem;
}

.mcpv-kpi-row__values {
	display: flex;
	flex-wrap: wrap;
	gap: 0.45rem;
}

.mcpv-kpi-pill {
	display: inline-flex;
	gap: 0.35rem;
	align-items: center;
	padding: 0.24rem 0.48rem;
	border-radius: 999px;
	background: var(--vscode-badge-background, #4444);
	color: var(--vscode-badge-foreground, var(--vscode-foreground));
	font-size: 0.76rem;
	font-family: var(--vscode-editor-font-family, monospace);
}

.mcpv-kpi-pill[data-tone="muted"] {
	opacity: 0.78;
}

.mcpv-kpi-pill[data-tone="danger"] {
	background: color-mix(in srgb, var(--vscode-charts-red, #d64545) 16%, transparent);
	color: var(--vscode-charts-red, #d64545);
}

.mcpv-kpi-trend__legend {
	display: flex;
	flex-wrap: wrap;
	gap: 0.5rem;
	margin-top: 0.6rem;
}

.mcpv-kpi-legend {
	display: inline-flex;
	align-items: center;
	gap: 0.35rem;
	font-size: 0.76rem;
	color: var(--vscode-descriptionForeground);
}

.mcpv-kpi-legend__dot {
	width: 0.6rem;
	height: 0.6rem;
	border-radius: 999px;
	display: inline-block;
}

.mcpv-kpi-trend__svg {
	width: 100%;
	height: 86px;
	display: block;
	margin-top: 0.5rem;
	background: linear-gradient(
		180deg,
		color-mix(in srgb, var(--vscode-editor-background) 70%, transparent),
		transparent
	);
	border-radius: 10px;
	overflow: hidden;
}

.mcpv-kpi-trend__axis {
	stroke: color-mix(in srgb, var(--vscode-widget-border, #8884) 72%, transparent);
	stroke-width: 1;
}

.mcpv-kpi-trend__line--primary {
	stroke: var(--vscode-charts-blue, #4d8eff);
	stroke-width: 2.25;
	fill: none;
}

.mcpv-kpi-trend__line--secondary {
	stroke: var(--vscode-charts-yellow, #e0a800);
	stroke-width: 2;
	fill: none;
	stroke-dasharray: 4 3;
}

.mcpv-kpi-list {
	margin: 0;
	padding-left: 1.1rem;
	display: grid;
	gap: 0.35rem;
}

@media (max-width: 640px) {
	.mcpv-kpi-dashboard {
		padding: 0.75rem;
	}

	.mcpv-kpi-toolbar,
	.mcpv-kpi-banner,
	.mcpv-kpi-card,
	.mcpv-kpi-section,
	.mcpv-kpi-trend {
		padding: 0.85rem;
	}
	}
</style>`;

const CLIENT_SCRIPT = `<script>
(function () {
	const host =
		typeof acquireVsCodeApi === 'function' ? acquireVsCodeApi() : null;
	document.addEventListener('click', function (evt) {
		const target = evt.target;
		if (!(target instanceof Element)) return;
		const refresh = target.closest('[data-kpi-action="refresh"]');
		if (refresh) {
			evt.preventDefault();
			host?.postMessage({ command: 'refresh' });
			return;
		}
		const windowButton = target.closest('[data-kpi-window-days]');
		if (!windowButton) return;
		const raw = windowButton.getAttribute('data-kpi-window-days');
		const days = Number(raw);
		if (!Number.isFinite(days)) return;
		evt.preventDefault();
		host?.postMessage({ command: 'setWindowDays', windowDays: days });
	});
})();
</script>`;

const stateLabel = (state: TKpiDashboardViewState): string => {
	switch (state) {
		case 'loading':
			return 'Loading';
		case 'ready':
			return 'Ready';
		case 'partial':
			return 'Partial';
		case 'unavailable':
			return 'Unavailable';
		case 'disconnected':
			return 'Disconnected';
		case 'empty':
			return 'Empty';
	}
	return 'Unavailable';
};

const formatMetricValue = (metric: IKpiDashboardMetric): string => {
	if (metric.value === undefined) return 'Not available';
	switch (metric.unit) {
		case 'score':
		case 'count':
			return formatNumber(metric.value);
		case 'ratio':
			return `${(metric.value * 100).toFixed(metric.value < 0.1 ? 1 : 0)}%`;
		case 'tokens':
			return formatTokens(metric.value);
		case 'usd':
			return `$${metric.value.toFixed(metric.value < 10 ? 2 : 0)}`;
		case 'bytes':
			return `${formatNumber(metric.value)} B`;
		case 'ms':
			return formatMs(metric.value);
	}
	return formatNumber(metric.value);
};

const metricStatusLabel = (status: TKpiDashboardMetricStatus): string => {
	return status.replace(/-/g, ' ');
};

const sparklinePath = (
	values: readonly number[],
	width: number,
	height: number,
): string => {
	if (values.length === 0 || width <= 0 || height <= 0) return '';
	if (values.length === 1) {
		const y = height / 2;
		return `M 0 ${y} L ${width} ${y}`;
	}
	const finite = values.map((value) => (Number.isFinite(value) ? value : 0));
	const min = Math.min(...finite);
	const max = Math.max(...finite);
	const range = max - min;
	const step = width / (finite.length - 1);
	const yOf = (value: number): number => {
		if (range === 0) return height / 2;
		return height - ((value - min) / range) * height;
	};
	return finite
		.map(
			(value, index) =>
				`${index === 0 ? 'M' : 'L'} ${index * step} ${yOf(value)}`,
		)
		.join(' ');
};

const renderStatusChip = (state: TKpiDashboardViewState): string =>
	`<span class="mcpv-kpi-status mcpv-kpi-status--${escapeHtml(state)}">${escapeHtml(stateLabel(state))}</span>`;

const renderMetricCard = (metric: IKpiDashboardMetric): string =>
	`<article class="mcpv-kpi-card">
		<div class="mcpv-kpi-card__label">${escapeHtml(metric.label)}</div>
		<span class="mcpv-kpi-card__value">${escapeHtml(formatMetricValue(metric))}</span>
		<div class="mcpv-kpi-muted">${escapeHtml(metricStatusLabel(metric.status))}${metric.observedAt === undefined ? '' : ` · ${escapeHtml(formatDate(metric.observedAt))}`}</div>
	</article>`;

const renderSectionMetric = (metric: IKpiDashboardMetric): string =>
	`<div class="mcpv-kpi-metric">
		<div class="mcpv-kpi-metric__label">${escapeHtml(metric.label)}</div>
		<span class="mcpv-kpi-metric__value">${escapeHtml(formatMetricValue(metric))}</span>
		<div class="mcpv-kpi-muted">${escapeHtml(metricStatusLabel(metric.status))}</div>
	</div>`;

const renderRowValue = (value: IKpiDashboardRowValue): string =>
	`<span class="mcpv-kpi-pill" data-tone="${escapeHtml(value.tone ?? 'default')}"><strong>${escapeHtml(value.label)}:</strong> ${escapeHtml(value.value)}</span>`;

const renderRow = (row: IKpiDashboardRow): string =>
	`<article class="mcpv-kpi-row">
		<div class="mcpv-kpi-row__head">
			<div>
				<p class="mcpv-kpi-row__title">${escapeHtml(row.label)}</p>
				${row.subtitle === undefined ? '' : `<div class="mcpv-kpi-row__meta">${escapeHtml(row.subtitle)}</div>`}
			</div>
			${renderStatusChip(row.state)}
		</div>
		${row.values.length === 0 ? '' : `<div class="mcpv-kpi-row__values">${row.values.map(renderRowValue).join('')}</div>`}
		${row.note === undefined ? '' : `<div class="mcpv-kpi-muted">${escapeHtml(row.note)}</div>`}
	</article>`;

const renderSeriesSvg = (
	series: readonly IKpiDashboardTrendSeries[],
): string => {
	const plotted = series
		.map((entry, index) => ({
			entry,
			values: entry.points
				.map((point) => point.value)
				.filter((value): value is number => typeof value === 'number'),
			index,
		}))
		.filter((entry) => entry.values.length > 0);
	if (plotted.length === 0) {
		return `<div class="mcpv-kpi-muted">No numeric samples in the selected window.</div>`;
	}
	return `<svg class="mcpv-kpi-trend__svg" viewBox="0 0 240 86" preserveAspectRatio="none" aria-hidden="true">
		<line class="mcpv-kpi-trend__axis" x1="0" y1="84" x2="240" y2="84"></line>
		${plotted
			.map(({ values, index }) => {
				const klass =
					index === 0
						? 'mcpv-kpi-trend__line--primary'
						: 'mcpv-kpi-trend__line--secondary';
				return `<path class="${klass}" d="${sparklinePath(values, 240, 76)}"></path>`;
			})
			.join('')}
	</svg>`;
};

const renderTrendCard = (card: IKpiDashboardTrendCard): string =>
	`<article class="mcpv-kpi-trend">
		<div class="mcpv-kpi-trend__head">
			<div>
				<h3 class="mcpv-kpi-trend__title">${escapeHtml(card.title)}</h3>
				${card.note === undefined ? '' : `<div class="mcpv-kpi-trend__meta">${escapeHtml(card.note)}</div>`}
			</div>
			${renderStatusChip(card.state)}
		</div>
		${renderSeriesSvg(card.series)}
		<div class="mcpv-kpi-trend__legend">${card.series
			.map(
				(entry, index) =>
					`<span class="mcpv-kpi-legend"><span class="mcpv-kpi-legend__dot" style="background:${
						index === 0
							? 'var(--vscode-charts-blue, #4d8eff)'
							: 'var(--vscode-charts-yellow, #e0a800)'
					};"></span>${escapeHtml(entry.label)} · ${escapeHtml(metricStatusLabel(entry.status))}</span>`,
			)
			.join('')}</div>
	</article>`;

const renderSection = (section: IKpiDashboardSection): string =>
	`<section class="mcpv-kpi-section">
		<div class="mcpv-kpi-section__head">
			<div>
				<h3 class="mcpv-kpi-section__title"><span aria-hidden="true">${escapeHtml(section.icon)}</span>${escapeHtml(section.title)}</h3>
				${section.note === undefined ? '' : `<div class="mcpv-kpi-muted">${escapeHtml(section.note)}</div>`}
			</div>
			${renderStatusChip(section.state)}
		</div>
		${section.metrics.length === 0 ? '' : `<div class="mcpv-kpi-section__metrics">${section.metrics.map(renderSectionMetric).join('')}</div>`}
		${section.rows.length === 0 ? `<div class="mcpv-kpi-muted">No drill-down rows for this section in the selected window.</div>` : `<div class="mcpv-kpi-rowlist">${section.rows.map(renderRow).join('')}</div>`}
	</section>`;

const renderFooterList = (title: string, items: readonly string[]): string => {
	if (items.length === 0) return '';
	return `<section class="mcpv-kpi-card">
		<div class="mcpv-kpi-foot__head">
			<h3 class="mcpv-kpi-foot__title">${escapeHtml(title)}</h3>
		</div>
		<ol class="mcpv-kpi-list">${items
			.map(
				(item) => `<li class="mcpv-kpi-muted">${escapeHtml(item)}</li>`,
			)
			.join('')}</ol>
	</section>`;
};

const renderRecommendations = (
	recommendations: readonly IKpiDashboardRecommendation[],
): string => {
	if (recommendations.length === 0) return '';
	return `<section class="mcpv-kpi-card">
		<div class="mcpv-kpi-foot__head">
			<h3 class="mcpv-kpi-foot__title">Next actions</h3>
		</div>
		<ol class="mcpv-kpi-list">${recommendations
			.map(
				(item) =>
					`<li class="mcpv-kpi-muted"><strong>${escapeHtml(item.priority)}</strong> · ${escapeHtml(item.tool)} · ${escapeHtml(item.reason)}</li>`,
			)
			.join('')}</ol>
	</section>`;
};

const bannerSummary = (model: IKpiDashboardModel): string => {
	if (model.state === 'loading') {
		return 'Loading project KPI views for the selected window.';
	}
	if (model.state === 'disconnected') {
		return 'The dashboard could not reach the MCP server or the KPI tool.';
	}
	if (model.state === 'unavailable') {
		return 'The KPI tool did not return any consumable data for this workspace.';
	}
	if (model.state === 'empty') {
		return 'The KPI tool responded, but the selected window has no persisted history or drill-down rows yet.';
	}
	if (model.state === 'partial') {
		return 'Some KPI sections loaded, but at least one view stayed partial, unavailable or empty.';
	}
	return model.summary;
};

export const renderKpiDashboard = (
	model: IKpiDashboardModel,
	options: IRenderKpiDashboardOptions = {},
): string => {
	const header = renderHeaderBar({
		brandName: options.brandName ?? 'mcp-vertex KPI Dashboard',
		version: options.version ?? '0.1.0',
	});
	return `<!DOCTYPE html>
<html lang="en">
<head>
	<meta charset="UTF-8" />
	<meta name="viewport" content="width=device-width, initial-scale=1.0" />
	<title>${escapeHtml(model.title)}</title>
	<style>${componentCss}</style>
	<style>${dashboardCss}</style>
	${STYLE}
</head>
<body>
	<div class="mcpv-kpi-dashboard">
		${header}
		<section class="mcpv-kpi-toolbar">
			<div class="mcpv-kpi-toolbar__group">
				${renderStatusChip(model.state)}
				<span class="mcpv-kpi-muted">${escapeHtml(model.windowLabel)}</span>
				${model.generatedAt === undefined ? '' : `<span class="mcpv-kpi-muted">Updated ${escapeHtml(formatDate(model.generatedAt))}</span>`}
			</div>
			<div class="mcpv-kpi-toolbar__group">
				${model.windows
					.map(
						(option) =>
							`<button class="mcpv-kpi-button" data-kpi-window-days="${option.days}" data-selected="${option.selected ? 'true' : 'false'}">${escapeHtml(option.label)}</button>`,
					)
					.join('')}
				<button class="mcpv-kpi-button" data-kpi-action="refresh">Refresh</button>
			</div>
		</section>
		<section class="mcpv-kpi-banner">
			<div class="mcpv-kpi-banner__summary">${escapeHtml(bannerSummary(model))}</div>
			<div class="mcpv-kpi-muted">${escapeHtml(model.summary)}</div>
			${model.errors.length === 0 ? '' : `<div class="mcpv-kpi-muted">${escapeHtml(model.errors.join(' | '))}</div>`}
		</section>
		<section class="mcpv-kpi-grid">${model.summaryMetrics.map(renderMetricCard).join('')}</section>
		<section class="mcpv-kpi-trends">${model.trends.map(renderTrendCard).join('')}</section>
		<section class="mcpv-kpi-sections">${model.sections.map(renderSection).join('')}</section>
		${renderRecommendations(model.recommendations)}
		${renderFooterList('Limitations', model.limitations)}
	</div>
	${CLIENT_SCRIPT}
</body>
</html>`;
};

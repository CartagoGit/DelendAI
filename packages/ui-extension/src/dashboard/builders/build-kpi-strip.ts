import type { IDashboardAllModels } from '@mcp-vertex/client';
import type { ILangDict } from '@mcp-vertex/shared/i18n';
import { extensionText } from '../../i18n/extension-text';
import { escapeHtml, formatMs, formatNumber, formatTokens } from '../format';

/**
 * Scoped layout for the KPI strip. The dashboard panel layout is
 * otherwise host-supplied, so the strip ships its own flex-wrap rule
 * to stay readable in a narrow sidebar (≤ 280px) instead of
 * overflowing horizontally (H26). Each KPI gets a min flex-basis and
 * `min-width: 0` so long values can shrink rather than push siblings
 * off-screen.
 */
const KPI_STRIP_STYLE =
	'<style>.mv-kpis{display:flex;flex-wrap:wrap;gap:8px;}' +
	'.mv-kpis>.mv-kpi{flex:1 1 120px;min-width:0;}</style>';

export function buildKpiStrip(model: IDashboardAllModels, lang: ILangDict): string {
	const text = (key: string, vars?: Readonly<Record<string, string | number>>) =>
		extensionText(lang, key, vars);
	const t = model.overview.totals;
	return `${KPI_STRIP_STYLE}
<div class="mv-kpis">
	<div class="mv-kpi"><span class="mv-kpi__label">${escapeHtml(text('kpiTools'))}</span><span class="mv-kpi__value">${formatNumber(t.tools)}</span></div>
	<div class="mv-kpi"><span class="mv-kpi__label">${escapeHtml(text('kpiPlugins'))}</span><span class="mv-kpi__value">${formatNumber(t.plugins)}</span></div>
	<div class="mv-kpi"><span class="mv-kpi__label">${escapeHtml(text('kpiProposals'))}</span><span class="mv-kpi__value">${formatNumber(t.proposals)}</span></div>
	<div class="mv-kpi"><span class="mv-kpi__label">${escapeHtml(text('kpiCalls'))}</span><span class="mv-kpi__value">${formatNumber(t.calls)}</span></div>
	<div class="mv-kpi"><span class="mv-kpi__label">${escapeHtml(text('kpiTokens'))}</span><span class="mv-kpi__value">${formatTokens(t.tokens)}</span></div>
	<div class="mv-kpi"><span class="mv-kpi__label">${escapeHtml(text('kpiSaved'))}</span><span class="mv-kpi__value">${formatTokens(t.tokensSaved)}</span><span class="mv-kpi__hint">${t.savingsPercent}%</span></div>
	<div class="mv-kpi"><span class="mv-kpi__label">${escapeHtml(text('kpiWall'))}</span><span class="mv-kpi__value">${formatMs(t.totalMs)}</span></div>
	<div class="mv-kpi"><span class="mv-kpi__label">${escapeHtml(text('kpiAgents'))}</span><span class="mv-kpi__value">${formatNumber(t.agents)}</span></div>
</div>
`.trim();
}

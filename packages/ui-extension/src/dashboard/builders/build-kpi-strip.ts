import type { IDashboardAllModels } from '@mcp-vertex/client';
import type { ILangDict } from '@mcp-vertex/shared/i18n';
import { extensionText } from '../../i18n/extension-text';
import { escapeHtml, formatMs, formatNumber, formatTokens } from '../format';

export function buildKpiStrip(model: IDashboardAllModels, lang: ILangDict): string {
	const text = (key: string, vars?: Readonly<Record<string, string | number>>) =>
		extensionText(lang, key, vars);
	const t = model.overview.totals;
	return `
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

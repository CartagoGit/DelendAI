import type { IDashboardAllModels } from '@delendai/client';
import type { ILangDict } from '@delendai/shared/i18n';
import { extensionText } from '../../i18n/extension-text';
import { escapeHtml, formatMs, formatNumber, formatTokens } from '../format';

/**
 * Scoped layout for the KPI strip. The dashboard panel layout is
 * otherwise host-supplied, so the strip ships its own flex-wrap rule
 * to stay readable in a narrow sidebar (≤ 280px) instead of
 * overflowing horizontally (H26). Each KPI gets a min flex-basis and
 * `min-width: 0` so long values can shrink rather than push siblings
 * off-screen.
 *
 * The KPI grid + per-card rules now live in `dashboardCss` (see
 * `apps/shared/src/styles/dashboard/dashboard-css.ts`) so the same
 * rules govern the dashboard in every embedding — the standalone web,
 * the dev entry, and inside the VS Code webview host. The strip uses
 * a CSS grid `auto-fit, minmax(180px, 1fr)` that collapses to one
 * column under 640px, two at 640–1024px, and stays fluid above that.
 *
 * No more inline `<style>` here — we don't want duplicate rules
 * accidentally overridden by host stylesheets.
 */

export function buildKpiStrip(
	model: IDashboardAllModels,
	lang: ILangDict,
): string {
	const text = (
		key: string,
		vars?: Readonly<Record<string, string | number>>,
	) => extensionText(lang, key, vars);
	const t = model.overview.totals;
	return `
<div class="mcpv-kpis">
	<div class="mcpv-kpi"><span class="mcpv-kpi__label">${escapeHtml(text('kpiTools'))}</span><span class="mcpv-kpi__value">${formatNumber(t.tools)}</span></div>
	<div class="mcpv-kpi"><span class="mcpv-kpi__label">${escapeHtml(text('kpiPlugins'))}</span><span class="mcpv-kpi__value">${formatNumber(t.plugins)}</span></div>
	<div class="mcpv-kpi"><span class="mcpv-kpi__label">${escapeHtml(text('kpiProposals'))}</span><span class="mcpv-kpi__value">${formatNumber(t.proposals)}</span></div>
	<div class="mcpv-kpi"><span class="mcpv-kpi__label">${escapeHtml(text('kpiCalls'))}</span><span class="mcpv-kpi__value">${formatNumber(t.calls)}</span></div>
	<div class="mcpv-kpi"><span class="mcpv-kpi__label">${escapeHtml(text('kpiTokens'))}</span><span class="mcpv-kpi__value">${formatTokens(t.tokens)}</span></div>
	<div class="mcpv-kpi"><span class="mcpv-kpi__label">${escapeHtml(text('kpiSaved'))}</span><span class="mcpv-kpi__value">${formatTokens(t.tokensSaved)}</span><span class="mcpv-kpi__hint">${t.savingsPercent}%</span></div>
	<div class="mcpv-kpi"><span class="mcpv-kpi__label">${escapeHtml(text('kpiWall'))}</span><span class="mcpv-kpi__value">${formatMs(t.totalMs)}</span></div>
	<div class="mcpv-kpi"><span class="mcpv-kpi__label">${escapeHtml(text('kpiAgents'))}</span><span class="mcpv-kpi__value">${formatNumber(t.agents)}</span></div>
</div>
`.trim();
}

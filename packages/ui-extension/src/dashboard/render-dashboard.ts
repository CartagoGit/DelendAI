/**
 * `renderDashboard` — top-level composer for the IDE dashboard.
 * Embeds the brand header, KPI strip, 8 tabs + the 8 panels, footer,
 * and the tiny client-side script that powers tab switching and
 * "Refresh" / "Open docs" actions.
 *
 * Pure: returns a single HTML string. The host loads it via
 * `panel.webview.setHtml(...)`.
 */
import type { IDashboardAllModels } from '@mcp-vertex/client';

import { renderHeaderBar, componentCss, renderRuntime } from '../components';
import { escapeHtml, formatMs, formatNumber, formatTokens } from './format';
import { renderPanelAgents } from './render-panel-agents';
import { renderPanelHealth } from './render-panel-health';
import { renderPanelMetrics } from './render-panel-metrics';
import { renderPanelOverview } from './render-panel-overview';
import { renderPanelPlugins } from './render-panel-plugins';
import { renderPanelSessions } from './render-panel-sessions';
import { renderPanelTimes } from './render-panel-times';
import { renderPanelTokens } from './render-panel-tokens';
import { renderPanelTools } from './render-panel-tools';

export interface IRenderDashboardOptions {
	readonly docsUrl: string;
	readonly refreshCommand: string;
	readonly openDocsCommand: string;
}

const TABS: ReadonlyArray<{ id: string; label: string }> = [
	{ id: 'overview', label: 'Overview' },
	{ id: 'metrics', label: 'Metrics' },
	{ id: 'tokens', label: 'Tokens' },
	{ id: 'tools', label: 'Tools' },
	{ id: 'plugins', label: 'Plugins' },
	{ id: 'sessions', label: 'Sessions' },
	{ id: 'times', label: 'Times' },
	{ id: 'agents', label: 'Agents' },
	{ id: 'health', label: 'Health' },
];

const CLIENT_SCRIPT = `
(function () {
  const tabs = document.querySelectorAll('.mv-tab');
  const panels = document.querySelectorAll('.mv-panel');
  tabs.forEach((tab) => {
    tab.addEventListener('click', () => {
      const target = tab.getAttribute('data-target');
      tabs.forEach((t) => t.setAttribute('aria-selected', t === tab ? 'true' : 'false'));
      panels.forEach((p) => p.setAttribute('data-active', p.id === 'panel-' + target ? 'true' : 'false'));
    });
  });
  // Sortable tools table — toggles asc/desc on a clicked header.
  const toolsTable = document.querySelector('.mv-tools-table');
  if (toolsTable) {
    const tbody = toolsTable.querySelector('tbody');
    const headers = toolsTable.querySelectorAll('th[data-sort]');
    headers.forEach((th) => {
      th.addEventListener('click', () => {
        const key = th.getAttribute('data-sort');
        const rows = Array.from(tbody.querySelectorAll('tr'));
        const currentDir = toolsTable.getAttribute('data-sortdir');
        const nextDir = currentDir === 'asc' ? 'desc' : 'asc';
        toolsTable.setAttribute('data-sortby', key);
        toolsTable.setAttribute('data-sortdir', nextDir);
        rows.sort((a, b) => {
          const av = a.getAttribute('data-' + key);
          const bv = b.getAttribute('data-' + key);
          const an = Number(av);
          const bn = Number(bv);
          const numeric = !Number.isNaN(an) && !Number.isNaN(bn);
          const cmp = numeric ? an - bn : String(av).localeCompare(String(bv));
          return nextDir === 'asc' ? cmp : -cmp;
        });
        rows.forEach((r) => tbody.appendChild(r));
      });
    });
  }
})();
`.trim();

export const renderDashboard = (
	model: IDashboardAllModels,
	options: IRenderDashboardOptions,
): string => {
	const t = model.overview.totals;
	const tabsHtml = TABS.map(
		(tab, ix) =>
			`<button class="mv-tab" id="tab-${tab.id}" role="tab" aria-selected="${ix === 0 ? 'true' : 'false'}" data-target="${tab.id}">${escapeHtml(tab.label)}</button>`,
	).join('');

	const tabsBar = `<div class="mv-tabs" role="tablist">${tabsHtml}<button class="mv-tab" id="tab-docs" role="tab" data-target="docs">Docs</button><button class="mv-tab" id="tab-refresh" role="tab" data-action="refresh" title="Refresh">⟳</button></div>`;

	const overviewPanel = renderPanelOverview(model.overview);
	const metricsPanel = renderPanelMetrics(model.metrics);
	const tokensPanel = renderPanelTokens(model.tokens);
	const toolsPanel = renderPanelTools(model.tools);
	const pluginsPanel = renderPanelPlugins(model.plugins);
	const sessionsPanel = renderPanelSessions(model.sessions);
	const timesPanel = renderPanelTimes(model.times);
	const agentsPanel = renderPanelAgents(model.agents);
	const healthPanel = renderPanelHealth(model.health);

	const docsPanel = `
<section class="mv-panel" id="panel-docs" role="tabpanel" aria-labelledby="tab-docs">
	<h2 class="mv-panel__title">Documentation</h2>
	<iframe class="mv-docs-frame" src="${escapeHtml(options.docsUrl)}" referrerpolicy="no-referrer" sandbox="allow-scripts allow-same-origin"></iframe>
	<p class="mv-fg-muted">Embedded from <a href="${escapeHtml(options.docsUrl)}">${escapeHtml(options.docsUrl)}</a></p>
</section>
`;

	const firstActive = TABS[0]?.id ?? 'overview';

	const kpiStrip = `
<div class="mv-kpis">
	<div class="mv-kpi"><span class="mv-kpi__label">Tools</span><span class="mv-kpi__value">${formatNumber(t.tools)}</span></div>
	<div class="mv-kpi"><span class="mv-kpi__label">Plugins</span><span class="mv-kpi__value">${formatNumber(t.plugins)}</span></div>
	<div class="mv-kpi"><span class="mv-kpi__label">Proposals</span><span class="mv-kpi__value">${formatNumber(t.proposals)}</span></div>
	<div class="mv-kpi"><span class="mv-kpi__label">Calls</span><span class="mv-kpi__value">${formatNumber(t.calls)}</span></div>
	<div class="mv-kpi"><span class="mv-kpi__label">Tokens</span><span class="mv-kpi__value">${formatTokens(t.tokens)}</span></div>
	<div class="mv-kpi"><span class="mv-kpi__label">Saved</span><span class="mv-kpi__value">${formatTokens(t.tokensSaved)}</span><span class="mv-kpi__hint">${t.savingsPercent}%</span></div>
	<div class="mv-kpi"><span class="mv-kpi__label">Wall</span><span class="mv-kpi__value">${formatMs(t.totalMs)}</span></div>
	<div class="mv-kpi"><span class="mv-kpi__label">Agents</span><span class="mv-kpi__value">${formatNumber(t.agents)}</span></div>
</div>
`;

	const panels = [
		overviewPanel,
		metricsPanel,
		tokensPanel,
		toolsPanel,
		pluginsPanel,
		sessionsPanel,
		timesPanel,
		agentsPanel,
		healthPanel,
		docsPanel,
	]
		.map((html, ix) => {
			const idMatch = html.match(/id="(panel-[a-z]+)"/);
			const id = idMatch?.[1] ?? `panel-${ix}`;
			const active = id === `panel-${firstActive}` ? 'true' : 'false';
			return html.replace(
				'<section class="mv-panel"',
				`<section class="mv-panel" data-active="${active}"`,
			);
		})
		.join('');

	const header = renderHeaderBar({
		brandName: 'mcp-vertex',
		version: `${escapeHtml(model.server.version)} · ${escapeHtml(model.server.name)}`,
	});

	return `<!DOCTYPE html>
<html lang="en">
<head>
	<meta charset="UTF-8" />
	<meta name="viewport" content="width=device-width, initial-scale=1.0" />
	<title>mcp-vertex Dashboard</title>
	<style>${componentCss}</style>
</head>
<body>
	${header}
	${kpiStrip}
	${tabsBar}
	<main class="mv-main">
		${panels}
	</main>
	<footer class="mv-footer">
		<span>refresh: <code>${escapeHtml(options.refreshCommand)}</code></span>
		<span class="mv-footer__sep">·</span>
		<span>docs: <code>${escapeHtml(options.docsUrl)}</code></span>
		<span class="mv-footer__sep">·</span>
		<span>fetched: <code>${escapeHtml(model.server.fetchedAt)}</code></span>
	</footer>
	<script>${CLIENT_SCRIPT}</script>
	${renderRuntime()}
</body>
</html>`;
};

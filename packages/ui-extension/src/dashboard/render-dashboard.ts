/**
 * `renderDashboard` — top-level composer for the IDE dashboard.
 * Embeds the brand header, KPI strip, 8 tabs + the 8 panels, footer,
 * and the tiny client-side script that powers tab switching.
 *
 * Pure: returns a single HTML string.
 */
import type { IDashboardAllModels } from '@mcp-vertex/client';
import type { ILangDict } from '@mcp-vertex/shared/i18n';
import { dashboardCss } from '@mcp-vertex/shared/styles/dashboard/dashboard-css';

import { componentCss, renderRuntime } from '../components';
import { extensionText } from '../i18n/extension-text';
import { escapeHtml } from './format';
import { buildHeader } from './builders/build-header';
import { buildKpiStrip } from './builders/build-kpi-strip';
import { buildTabsBar } from './builders/build-tabs-bar';
import { buildPanels } from './builders/build-panels';
import { buildFooter } from './builders/build-footer';

export interface IRenderDashboardOptions {
	readonly docsUrl: string;
	readonly refreshCommand: string;
	readonly openDocsCommand: string;
	readonly lang: ILangDict;
}

const CLIENT_SCRIPT = `
(function () {
	const host =
		typeof acquireVsCodeApi === 'function' ? acquireVsCodeApi() : null;
  const panels = document.querySelectorAll('.mcpv-panel');
  // Only real tabs participate in selection + the roving tabindex; the
  // refresh button is an action (no role="tab"), so it is excluded
  // by the [data-tab-trigger] selector (renderTabs only stamps that
  // attribute on tab buttons — f00102 S4-real-extract).
  const tabs = Array.prototype.slice.call(
    document.querySelectorAll('[data-tab-trigger]'),
  );
  function selectTab(tab, moveFocus) {
    const target = tab.getAttribute('data-tab-trigger');
    tabs.forEach((t) => {
      const on = t === tab;
      t.setAttribute('aria-selected', on ? 'true' : 'false');
      // Roving tabindex: only the selected tab is in the tab order.
      t.setAttribute('tabindex', on ? '0' : '-1');
    });
    panels.forEach((p) => p.setAttribute('data-active', p.id === 'panel-' + target ? 'true' : 'false'));
    if (moveFocus && typeof tab.focus === 'function') tab.focus();
  }
  tabs.forEach((tab, index) => {
    tab.addEventListener('click', () => selectTab(tab, false));
    tab.addEventListener('keydown', (evt) => {
      let next = -1;
      if (evt.key === 'ArrowRight') next = (index + 1) % tabs.length;
      else if (evt.key === 'ArrowLeft') next = (index - 1 + tabs.length) % tabs.length;
      else return;
      evt.preventDefault();
      selectTab(tabs[next], true);
    });
  });
	const refresh = document.querySelector('[data-action="refresh"]');
	refresh?.addEventListener('click', () => {
		host?.postMessage({ command: 'action', action: 'refresh' });
	});
	document.addEventListener('click', (evt) => {
		const target = evt.target;
		if (!(target instanceof Element)) return;
		const proposal = target.closest('[data-proposal]');
		const id = proposal?.getAttribute('data-proposal');
		if (!id) return;
		evt.preventDefault();
		host?.postMessage({ command: 'openProposal', id });
	});
  const toolsTable = document.querySelector('.mcpv-tools-table');
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
	const text = (
		key: string,
		vars?: Readonly<Record<string, string | number>>,
	) => extensionText(options.lang, key, vars);

	const header = buildHeader(model);
	const kpiStrip = buildKpiStrip(model, options.lang);
	const tabsBar = buildTabsBar(options.lang);
	const panels = buildPanels(model, options.lang, options.docsUrl);
	const footer = buildFooter(model, options, options.lang);

	return `<!DOCTYPE html>
<html lang="en">
<head>
	<meta charset="UTF-8" />
	<meta name="viewport" content="width=device-width, initial-scale=1.0" />
	<title>${escapeHtml(text('dashboard.title'))}</title>
	<style>${componentCss}</style>
	<style>${dashboardCss}</style>
</head>
<body>
	${header}
	${kpiStrip}
	${tabsBar}
	<main class="mcpv-main">
		${panels}
	</main>
	${footer}
	<script>${CLIENT_SCRIPT}</script>
	${renderRuntime()}
</body>
</html>`;
};

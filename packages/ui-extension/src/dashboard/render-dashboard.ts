/**
 * `renderDashboard` — top-level composer for the IDE dashboard.
 * Embeds the brand header, KPI strip, 8 tabs + the 8 panels, footer,
 * and the tiny client-side script that powers tab switching.
 *
 * Pure: returns a single HTML string.
 */
import type { IDashboardAllModels } from '@mcp-vertex/client';
import type { ILangDict } from '@mcp-vertex/shared/i18n';

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
  const tabs = document.querySelectorAll('.mv-tab');
  const panels = document.querySelectorAll('.mv-panel');
  tabs.forEach((tab) => {
    tab.addEventListener('click', () => {
      const target = tab.getAttribute('data-target');
      tabs.forEach((t) => t.setAttribute('aria-selected', t === tab ? 'true' : 'false'));
      panels.forEach((p) => p.setAttribute('data-active', p.id === 'panel-' + target ? 'true' : 'false'));
    });
  });
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
	const text = (key: string, vars?: Readonly<Record<string, string | number>>) =>
		extensionText(options.lang, key, vars);

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
</head>
<body>
	${header}
	${kpiStrip}
	${tabsBar}
	<main class="mv-main">
		${panels}
	</main>
	${footer}
	<script>${CLIENT_SCRIPT}</script>
	${renderRuntime()}
</body>
</html>`;
};

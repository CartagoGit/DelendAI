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
import { renderToolDetailBody } from './render-tool-detail';
import { renderProposalDetailBody } from './render-proposal-detail';

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
  const sidebarItems = document.querySelectorAll('[data-sidebar-trigger]');
  const navPanel = document.querySelector('[data-nav-panel]');
  const navToggle = document.querySelector('[data-nav-toggle]');
  function activateTarget(target) {
    const tab = tabs.find((item) => item.getAttribute('data-tab-trigger') === target);
    if (!tab) return;
    selectTab(tab, false);
    sidebarItems.forEach((item) => item.setAttribute('aria-current', item.getAttribute('data-sidebar-trigger') === target ? 'page' : 'false'));
    navPanel?.classList.remove('is-open');
    navToggle?.setAttribute('aria-expanded', 'false');
  }
  sidebarItems.forEach((item) => item.addEventListener('click', () => activateTarget(item.getAttribute('data-sidebar-trigger'))));
  navToggle?.addEventListener('click', () => {
    const open = navPanel?.classList.toggle('is-open') ?? false;
    navToggle.setAttribute('aria-expanded', open ? 'true' : 'false');
  });
	const refresh = document.querySelector('[data-action="refresh"]');
	refresh?.addEventListener('click', () => {
		host?.postMessage({ command: 'action', action: 'refresh' });
	});
  document.querySelectorAll('[data-action="expand"]').forEach((button) => {
    button.addEventListener('click', () => host?.postMessage({ command: 'action', action: 'expand' }));
  });
  document.querySelectorAll('[data-surface]').forEach((surface) => {
    surface.addEventListener('click', () => {
      const id = surface.getAttribute('data-surface');
      if (id) host?.postMessage({ command: 'openSurface', surface: id });
    });
  });
	document.addEventListener('click', (evt) => {
		const target = evt.target;
		if (!(target instanceof Element)) return;
    const tool = target.closest('[data-tool-name]');
    const toolName = tool?.getAttribute('data-tool-name');
    if (toolName) {
      evt.preventDefault();
      host?.postMessage({ command: 'openTool', name: toolName });
      return;
    }
		const proposal = target.closest('[data-proposal]');
		const id = proposal?.getAttribute('data-proposal');
		if (!id) return;
		evt.preventDefault();
		host?.postMessage({ command: 'openProposal', id });
	});
  const toolsTable = document.querySelector('.mcpv-tools-table');
  // ── Host-pushed detail overlay ────────────────────────────────────
  // The dashboard provider can push hostToolDetail / hostProposalDetail
  // / hostHideDetail payloads so a click on a tool/proposal row opens
  // the detail inside the shell instead of a native webview panel.
  // The renderers are imported eagerly below as RENDER_TOOL_BODY and
  // RENDER_PROPOSAL_BODY.
  const overlay = document.getElementById('mcpv-detail-overlay');
  const overlayBody = document.getElementById('mcpv-detail-overlay-body');
  const overlayTitle = document.getElementById('mcpv-detail-overlay-title');
  function showOverlay(title, html) {
    if (!overlay || !overlayBody || !overlayTitle) return;
    overlayTitle.textContent = title;
    overlayBody.innerHTML = html;
    overlay.setAttribute('data-active', 'true');
    overlay.removeAttribute('hidden');
  }
  function hideOverlay() {
    if (!overlay) return;
    overlay.setAttribute('data-active', 'false');
    overlay.setAttribute('hidden', '');
    if (overlayBody) overlayBody.innerHTML = '';
  }
  if (overlay) {
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) hideOverlay();
    });
    const closeBtn = overlay.querySelector('[data-detail-close]');
    if (closeBtn) closeBtn.addEventListener('click', hideOverlay);
  }
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') hideOverlay();
  });
  window.addEventListener('message', (event) => {
    const data = event && event.data;
    if (!data || typeof data !== 'object') return;
    const detail = window.__MCPV_DASHBOARD_DETAIL__ || {};
    if (data.command === 'hostToolDetail' && data.model && typeof detail.RENDER_TOOL_BODY === 'function') {
      showOverlay((data.model.tool && data.model.tool.name) || 'Tool', detail.RENDER_TOOL_BODY(data.model));
    } else if (data.command === 'hostProposalDetail' && data.model && typeof detail.RENDER_PROPOSAL_BODY === 'function') {
      showOverlay(data.model.id || 'Proposal', detail.RENDER_PROPOSAL_BODY(data.model));
    } else if (data.command === 'hostHideDetail') {
      hideOverlay();
    }
  });
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
	<style>
		.mcpv-detail-overlay {
			position: fixed; inset: 0; z-index: 9999;
			display: flex; align-items: center; justify-content: center;
			background: rgba(0, 0, 0, 0.55);
		}
		.mcpv-detail-overlay[hidden] { display: none; }
		.mcpv-detail-overlay__card {
			background: var(--vscode-editor-background, #1e1e1e);
			color: var(--vscode-foreground, #ddd);
			border: 1px solid var(--vscode-panel-border, #444);
			border-radius: 10px;
			max-width: 90vw; max-height: 90vh;
			width: 720px;
			display: flex; flex-direction: column;
			box-shadow: 0 12px 36px rgba(0, 0, 0, 0.45);
		}
		.mcpv-detail-overlay__head {
			display: flex; align-items: center; justify-content: space-between;
			padding: 10px 16px; border-bottom: 1px solid var(--vscode-panel-border, #444);
		}
		.mcpv-detail-overlay__head h2 {
			margin: 0; font-size: 14px; font-weight: 600;
		}
		.mcpv-detail-overlay__close {
			background: transparent; border: 0; color: inherit;
			font-size: 20px; cursor: pointer; line-height: 1;
		}
		.mcpv-detail-overlay__body {
			padding: 16px; overflow: auto; max-height: calc(90vh - 50px);
		}
		.mcpv-detail-overlay__body .tool-detail,
		.mcpv-detail-overlay__body .card { color: inherit; }
		.mcpv-detail-overlay__body h1, .mcpv-detail-overlay__body h2 { color: inherit; }
	</style>
</head>
<body>
	${header}
	${kpiStrip}
	${tabsBar}
	<main class="mcpv-main">
		${panels}
	</main>
	${footer}
	<div id="mcpv-detail-overlay" class="mcpv-detail-overlay" role="dialog" aria-modal="true" aria-labelledby="mcpv-detail-overlay-title" data-active="false" hidden>
		<div class="mcpv-detail-overlay__card">
			<header class="mcpv-detail-overlay__head">
				<h2 id="mcpv-detail-overlay-title">Detail</h2>
				<button type="button" class="mcpv-detail-overlay__close" data-detail-close aria-label="Close">×</button>
			</header>
			<div id="mcpv-detail-overlay-body" class="mcpv-detail-overlay__body"></div>
		</div>
	</div>
	<script>${CLIENT_SCRIPT}</script>
	<script>window.__MCPV_DASHBOARD_DETAIL__ = { RENDER_TOOL_BODY: ${renderToolDetailBody.toString()}, RENDER_PROPOSAL_BODY: ${renderProposalDetailBody.toString()} };</script>
	${renderRuntime()}
</body>
</html>`;
};

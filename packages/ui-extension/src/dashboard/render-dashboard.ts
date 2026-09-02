/**
 * `renderDashboard` — top-level composer for the IDE dashboard.
 * Embeds the brand header, KPI strip, 8 tabs + the 8 panels, footer,
 * and the tiny client-side script that powers tab switching.
 *
 * Pure: returns a single HTML string.
 */
import type {
	IDashboardAllModels,
	IExtensionSettings,
} from '@mcp-vertex/client';
import { DEFAULT_EXTENSION_SETTINGS } from '@mcp-vertex/client';
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
	readonly settings?: IExtensionSettings;
}

const CLIENT_SCRIPT = `
(function () {
	const host =
		typeof acquireVsCodeApi === 'function' ? acquireVsCodeApi() : null;
  const root = document.documentElement;
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
  document.querySelectorAll('[data-action="refresh"]').forEach((button) => {
    button.addEventListener('click', () => {
      host?.postMessage({ command: 'action', action: 'refresh' });
    });
  });
  document.querySelectorAll('[data-action="expand"]').forEach((button) => {
    button.addEventListener('click', () => host?.postMessage({ command: 'action', action: 'expand' }));
  });
  document.querySelectorAll('[data-surface]').forEach((surface) => {
    surface.addEventListener('click', () => {
      const id = surface.getAttribute('data-surface');
      const internalTarget = {
        proposals: 'proposals',
        knowledge: 'memory',
        configuration: 'settings',
        settings: 'settings',
      }[id ?? ''];
      if (internalTarget) {
        activateTarget(internalTarget);
        return;
      }
      if (id) host?.postMessage({ command: 'openSurface', surface: id });
    });
  });

  // ─── Settings bridge ─────────────────────────────────────────────
  const settingsForm = document.getElementById('mcpv-dashboard-settings-form');
  const settingsStatus = document.getElementById('mcpv-dashboard-settings-status');
  const RTL = new Set(['ar']);
  function applyTheme(theme) {
    if (!theme) return;
    root.setAttribute('data-theme', theme);
  }
  function applyLanguage(language) {
    if (!language) return;
    root.setAttribute('lang', language);
    root.setAttribute('dir', RTL.has(language) ? 'rtl' : 'ltr');
    const preview = document.querySelector('.mcpv-settings__preview');
    if (preview) preview.setAttribute('dir', RTL.has(language) ? 'rtl' : 'ltr');
    document.querySelectorAll('[data-lang-card]').forEach((card) => {
      card.setAttribute('aria-pressed',
        card.getAttribute('data-lang-card') === language ? 'true' : 'false');
    });
    const select = document.querySelector('select[name="language"]');
    if (select instanceof HTMLSelectElement) select.value = language;
    const headerSelect = document.querySelector('[data-header-lang]');
    if (headerSelect instanceof HTMLSelectElement) headerSelect.value = language;
  }
  function applyMotion(motion) {
    if (!motion) return;
    root.setAttribute('data-motion', motion);
    const select = document.querySelector('select[name="motion"]');
    if (select instanceof HTMLSelectElement) select.value = motion;
  }
  function readSettings() {
    const out = {};
    new FormData(settingsForm ?? document.createElement('form')).forEach(
      (value, key) => { out[key] = value; },
    );
    const allowLocalhost = document.querySelector('input[name="allowLocalhost"]');
    const allowPrivateIps = document.querySelector('input[name="allowPrivateIps"]');
    out.allowLocalhost = allowLocalhost instanceof HTMLInputElement ? allowLocalhost.checked : false;
    out.allowPrivateIps = allowPrivateIps instanceof HTMLInputElement ? allowPrivateIps.checked : false;
    return out;
  }
  function postSettings(action) {
    if (!host) return;
    const payload = { command: 'settings', action };
    if (action === 'save') payload.settings = readSettings();
    host.postMessage(payload);
  }
  function announceSettings(message, isError) {
    if (!settingsStatus) return;
    settingsStatus.textContent = message;
    settingsStatus.hidden = false;
    settingsStatus.setAttribute('data-error', isError ? 'true' : 'false');
  }
  document.querySelectorAll('[data-theme-card]').forEach((card) => {
    card.addEventListener('click', () => {
      const theme = card.getAttribute('data-theme-card');
      if (!theme) return;
      document.querySelectorAll('[data-theme-card]').forEach((c) =>
        c.setAttribute('aria-pressed', c === card ? 'true' : 'false'));
      applyTheme(theme);
      const preview = document.querySelector('.mcpv-settings__preview');
      if (preview) preview.setAttribute('data-theme-preview', theme);
      postSettings('save');
    });
  });
  document.querySelectorAll('[data-lang-card]').forEach((card) => {
    card.addEventListener('click', () => {
      const language = card.getAttribute('data-lang-card');
      if (!language) return;
      applyLanguage(language);
      postSettings('save');
    });
  });
  document.querySelectorAll(
    'select[name="theme"], select[name="motion"], select[name="logLevel"], [data-header-lang], [data-header-theme]',
  ).forEach((select) => {
    select.addEventListener('change', () => {
      if (!(select instanceof HTMLSelectElement)) return;
      const name = select.getAttribute('name') ?? '';
      if (name === 'theme' || select.hasAttribute('data-header-theme')) {
        applyTheme(select.value);
      } else if (name === 'motion') {
        applyMotion(select.value);
      } else if (select.hasAttribute('data-header-lang')) {
        applyLanguage(select.value);
      }
      postSettings('save');
    });
  });
  document.querySelectorAll('input[name="docsUrl"]').forEach((input) => {
    input.addEventListener('change', () => postSettings('save'));
  });
  document.querySelectorAll(
    'input[name="allowLocalhost"], input[name="allowPrivateIps"]',
  ).forEach((input) => {
    input.addEventListener('change', () => postSettings('save'));
  });
  settingsForm?.addEventListener('submit', (event) => {
    event.preventDefault();
    if (!host) {
      announceSettings('Settings are unavailable in this preview.', true);
      return;
    }
    announceSettings('Saving settings...', false);
    postSettings('save');
  });
  settingsForm?.querySelector('[data-settings-reset]')?.addEventListener(
    'click',
    () => {
      if (!host) return;
      announceSettings('Resetting settings...', false);
      postSettings('reset');
    },
  );
  document.querySelectorAll('[data-settings-compact]').forEach((toggle) => {
    toggle.addEventListener('change', () => {
      const settingsPanels = document.querySelectorAll('#panel-settings');
      settingsPanels.forEach((panel) => {
        if (toggle instanceof HTMLInputElement && toggle.checked) {
          panel.classList.add('mcpv-panel--compact');
        } else {
          panel.classList.remove('mcpv-panel--compact');
        }
      });
      try {
        window.localStorage.setItem(
          'mcpv:dashboard-compact',
          toggle instanceof HTMLInputElement && toggle.checked ? '1' : '0',
        );
      } catch {
        /* localStorage might be disabled; the visual toggle still works. */
      }
    });
  });
  window.addEventListener('message', (event) => {
    const data = event?.data;
    if (!data || data.command !== 'settingsResult') return;
    if (data.settings) {
      applyTheme(data.settings.theme);
      applyLanguage(data.settings.language);
      applyMotion(data.settings.motion);
    }
    if (data.error) {
      announceSettings(String(data.error), true);
    } else {
      announceSettings('Settings saved.', false);
    }
  });
  // Restore the compact-mode toggle from localStorage so the user does
  // not have to flip it back every reload.
  try {
    const stored = window.localStorage.getItem('mcpv:dashboard-compact');
    const compact = stored === '1';
    document.querySelectorAll('[data-settings-compact]').forEach((toggle) => {
      if (toggle instanceof HTMLInputElement) toggle.checked = compact;
    });
    document.querySelectorAll('#panel-settings').forEach((panel) => {
      if (compact) panel.classList.add('mcpv-panel--compact');
    });
  } catch {
    /* localStorage might be disabled in this host; nothing to restore. */
  }

  // ─── Logs panel — realtime subscribe over the host bridge ─────────
  const logsList = document.getElementById('mcpv-logs-list');
  const logsEmpty = document.getElementById('mcpv-logs-empty');
  const logsStatus = document.getElementById('mcpv-logs-status');
  const logsControls = document.getElementById('mcpv-logs-controls');
  const logsState = { paused: false, source: 'all', followTail: true };
  function setLogsStatus(text) {
    if (logsStatus) logsStatus.textContent = text;
  }
  function logsVisible() {
    if (!logsList || !logsEmpty) return false;
    const any = logsList.children.length > 0;
    logsEmpty.hidden = any;
    return any;
  }
  function appendLogRow(payload) {
    if (!logsList) return;
    const row = document.createElement('li');
    row.className = 'mcpv-logs__row';
    row.setAttribute('data-outcome', payload.outcome ?? 'unknown');
    row.tabIndex = 0;
    row.setAttribute('role', 'button');
    const ts = document.createElement('span');
    ts.className = 'mcpv-logs__ts';
    ts.textContent = payload.ts ? new Date(payload.ts).toISOString().slice(11, 19) : '';
    const kind = document.createElement('span');
    kind.className = 'mcpv-logs__kind';
    kind.textContent = payload.kind ?? '';
    const agent = document.createElement('span');
    agent.textContent = payload.agent ?? '';
    const summary = document.createElement('span');
    summary.className = 'mcpv-logs__summary';
    summary.textContent = payload.summary ?? '';
    const copy = document.createElement('button');
    copy.type = 'button';
    copy.className = 'mcpv-logs__copy';
    copy.title = 'Copy task id';
    copy.textContent = '#';
    copy.addEventListener('click', (evt) => {
      evt.stopPropagation();
      if (payload.taskId && navigator.clipboard) {
        navigator.clipboard.writeText(payload.taskId).catch(() => {});
      }
    });
    row.appendChild(ts);
    row.appendChild(kind);
    row.appendChild(agent);
    row.appendChild(summary);
    row.appendChild(copy);
    row.addEventListener('click', () => openLogDetail(payload));
    row.addEventListener('keydown', (evt) => {
      if (evt.key === 'Enter' || evt.key === ' ') {
        evt.preventDefault();
        openLogDetail(payload);
      }
    });
    logsList.appendChild(row);
    if (logsState.followTail) {
      logsList.scrollTop = logsList.scrollHeight;
    }
    logsVisible();
  }
  const logsDetail = document.getElementById('mcpv-logs-detail');
  const logsDetailTitle = document.getElementById('mcpv-logs-detail-title');
  const logsDetailBody = document.getElementById('mcpv-logs-detail-body');
  function openLogDetail(payload) {
    if (!logsDetail || !logsDetailTitle || !logsDetailBody) return;
    logsDetailTitle.textContent = payload.kind ?? 'event';
    const rows = [];
    const fields = ['ts', 'kind', 'agent', 'taskId', 'outcome', 'summary'];
    for (const field of fields) {
      const value = payload[field];
      if (value === undefined || value === null || value === '') continue;
      const dt = document.createElement('dt');
      dt.textContent = field;
      const dd = document.createElement('dd');
      dd.textContent = String(value);
      rows.push(dt, dd);
    }
    if (payload.files && payload.files.length > 0) {
      const dt = document.createElement('dt');
      dt.textContent = 'files';
      const dd = document.createElement('dd');
      dd.textContent = payload.files.join(', ');
      rows.push(dt, dd);
    }
    if (payload.meta && Object.keys(payload.meta).length > 0) {
      const dt = document.createElement('dt');
      dt.textContent = 'meta';
      const dd = document.createElement('dd');
      const pre = document.createElement('pre');
      pre.textContent = JSON.stringify(payload.meta, null, 2);
      dd.appendChild(pre);
      rows.push(dt, dd);
    }
    logsDetailBody.replaceChildren(...rows);
    logsDetail.removeAttribute('hidden');
  }
  function closeLogDetail() {
    if (logsDetail) logsDetail.setAttribute('hidden', '');
  }
  document.querySelector('[data-logs-action="close-detail"]')?.addEventListener('click', closeLogDetail);
  logsControls?.querySelector('select[name="source"]')?.addEventListener('change', (e) => {
    const target = e.target;
    if (target instanceof HTMLSelectElement) {
      logsState.source = target.value;
      setLogsStatus('Filtering source: ' + target.value);
      host?.postMessage({ command: 'logs', action: 'source', source: target.value });
    }
  });
  document.querySelectorAll('[data-source]').forEach((chip) => {
    chip.addEventListener('click', () => {
      const source = chip.getAttribute('data-source');
      if (!source) return;
      logsState.source = source;
      document.querySelectorAll('[data-source]').forEach((other) => {
        other.setAttribute('aria-pressed', other === chip ? 'true' : 'false');
      });
      setLogsStatus('Filtering source: ' + source);
      host?.postMessage({ command: 'logs', action: 'source', source });
    });
  });
  logsControls?.querySelector('select[name="outcome"]')?.addEventListener('change', (e) => {
    const target = e.target;
    if (target instanceof HTMLSelectElement) {
      host?.postMessage({ command: 'logs', action: 'filter', outcome: target.value });
    }
  });
  logsControls?.querySelector('input[name="agent"]')?.addEventListener('change', (e) => {
    const target = e.target;
    if (target instanceof HTMLInputElement) {
      host?.postMessage({ command: 'logs', action: 'filter', agent: target.value });
    }
  });
  logsControls?.querySelector('input[name="task"]')?.addEventListener('change', (e) => {
    const target = e.target;
    if (target instanceof HTMLInputElement) {
      host?.postMessage({ command: 'logs', action: 'filter', taskId: target.value });
    }
  });
  logsControls?.querySelector('[data-logs-action="refresh"]')?.addEventListener('click', () => {
    host?.postMessage({ command: 'logs', action: 'refresh' });
  });
  const toggleLiveBtn = logsControls?.querySelector('[data-logs-action="toggle-live"]');
  toggleLiveBtn?.addEventListener('click', () => {
    logsState.paused = !logsState.paused;
    if (toggleLiveBtn) {
      toggleLiveBtn.textContent = logsState.paused ? 'Resume realtime' : 'Pause realtime';
    }
    setLogsStatus(logsState.paused ? 'Realtime paused' : 'Following live events');
    host?.postMessage({ command: 'logs', action: logsState.paused ? 'stop' : 'start' });
  });
  logsControls?.querySelector('[data-logs-action="clear"]')?.addEventListener('click', () => {
    if (logsList) logsList.replaceChildren();
    logsVisible();
    setLogsStatus('Cleared.');
  });
  const logsSearch = document.getElementById('mcpv-logs-search');
  logsSearch?.addEventListener('input', () => {
    if (!(logsSearch instanceof HTMLInputElement)) return;
    const needle = logsSearch.value.trim().toLowerCase();
    if (!logsList) return;
    for (const row of Array.from(logsList.querySelectorAll('li'))) {
      const haystack = row.textContent?.toLowerCase() ?? '';
      row.toggleAttribute('hidden', needle.length > 0 && !haystack.includes(needle));
    }
    let visible = 0;
    for (const row of Array.from(logsList.querySelectorAll('li'))) {
      if (!row.hasAttribute('hidden')) visible += 1;
    }
    if (logsEmpty) {
      logsEmpty.textContent = needle.length > 0 && visible === 0
        ? 'No events match "' + needle + '".'
        : 'No log events match the current filter.';
      logsEmpty.hidden = visible > 0;
    }
  });
  window.addEventListener('message', (event) => {
    const data = event?.data;
    if (!data || data.command !== 'hostLogEvent') return;
    if (logsState.paused) return;
    if (logsState.source !== 'all' && data.source && logsState.source !== data.source) return;
    appendLogRow(data.event ?? {});
  });
  setLogsStatus('Realtime paused');
  logsVisible();

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

	const settings: IExtensionSettings =
		options.settings ?? DEFAULT_EXTENSION_SETTINGS;
	const initialLanguage = settings.language || 'en';
	const initialDir = initialLanguage === 'ar' ? 'rtl' : 'ltr';
	const header = buildHeader(model, settings);
	const kpiStrip = buildKpiStrip(model, options.lang);
	const tabsBar = buildTabsBar(options.lang);
	const panels = buildPanels(model, options.lang, options.docsUrl, settings);
	const footer = buildFooter(model, options, options.lang);

	return `<!DOCTYPE html>
<html lang="${escapeHtml(initialLanguage)}" dir="${escapeHtml(initialDir)}">
<head>
	<meta charset="UTF-8" />
	<meta name="viewport" content="width=device-width, initial-scale=1.0" />
	<title>${escapeHtml(text('dashboard.title'))}</title>
	<style>${componentCss}</style>
	<style>${dashboardCss}</style>
	<style>
    .mcpv-shell {
      display: grid;
      grid-template-columns: minmax(15rem, 18rem) minmax(0, 1fr);
      gap: 1.25rem;
      align-items: start;
    }
    .mcpv-main {
      min-width: 0;
    }
    .mcpv-panel--shell {
      container-type: inline-size;
    }
    .mcpv-shell-stack {
      display: grid;
      gap: 1rem;
    }
    .mcpv-shell-section {
      display: grid;
      gap: 0.85rem;
      padding: 1rem;
      border: 1px solid var(--vscode-panel-border, #444);
      border-radius: 14px;
      background: var(--vscode-editor-background, #1e1e1e);
    }
    .mcpv-shell-section__head {
      display: grid;
      gap: 0.3rem;
    }
    .mcpv-shell-section__head > p {
      margin: 0;
    }
    .mcpv-shell-section__title {
      margin: 0;
      font-size: 1rem;
    }
    .mcpv-shell-state {
      border-left: 4px solid var(--vscode-textLink-foreground, #3794ff);
    }
    .mcpv-shell-state[data-state-tone="empty"] {
      border-left-color: var(--vscode-descriptionForeground, #9da5b4);
    }
    .mcpv-shell-state[data-state-tone="error"] {
      border-left-color: var(--vscode-errorForeground, #f14c4c);
    }
    .mcpv-shell-state[data-state-tone="unavailable"] {
      border-left-color: var(--vscode-inputValidation-warningBorder, #cca700);
    }
    @media (max-width: 960px) {
      .mcpv-shell {
        grid-template-columns: 1fr;
      }
    }
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
	<div class="mcpv-shell">
    ${tabsBar}
    <main class="mcpv-main">
      ${panels}
    </main>
	</div>
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

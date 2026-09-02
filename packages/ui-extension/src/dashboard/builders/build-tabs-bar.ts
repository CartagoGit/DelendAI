import type { ILangDict } from '@mcp-vertex/shared/i18n';
import { renderTabs } from '@mcp-vertex/shared/components/ui/tabs';

import { extensionText } from '../../i18n/extension-text';

export const TABS: ReadonlyArray<{
	id: string;
	label: string;
	fallback: string;
}> = [
	{ id: 'status', label: 'tabStatus', fallback: 'Status' },
	{ id: 'overview', label: 'tabOverview', fallback: 'Overview' },
	{ id: 'tools', label: 'tabTools', fallback: 'Tools' },
	{ id: 'memory', label: 'tabMemory', fallback: 'Memory' },
	{ id: 'proposals', label: 'tabSessions', fallback: 'Proposals' },
	{ id: 'agents', label: 'tabAgents', fallback: 'Agents' },
	{ id: 'kpis', label: 'dashboard.kpis.title', fallback: 'KPIs' },
	{ id: 'plugins', label: 'tabPlugins', fallback: 'Plugins' },
	{ id: 'health', label: 'tabHealth', fallback: 'Health' },
	{ id: 'docs', label: 'tabDocs', fallback: 'Docs' },
	{ id: 'settings', label: 'tabSettings', fallback: 'Configuration' },
];

// Iconography shared by the surface action buttons (sidebar + tab
// strip). Inline SVG so they inherit the dashboard theme colour via
// `currentColor`. Pure-emoji symbols were the previous fallback but
// rendered inconsistently across host themes; SVG icons look the
// same everywhere.
const REFRESH_ICON = `<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" d="M21 12a9 9 0 1 1-3.46-7.1"/><polyline points="21 4 21 10 15 10" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
const EXPAND_ICON = `<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" d="M15 3h6v6"/><line x1="21" y1="3" x2="10" y2="14" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><path fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" d="M9 21H3v-6"/><line x1="3" y1="21" x2="14" y2="10" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>`;
const SURFACE_ICONS: Readonly<Record<string, string>> = {
	proposals: `<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="4" width="18" height="16" rx="2" fill="none" stroke="currentColor" stroke-width="1.8"/><line x1="3" y1="10" x2="21" y2="10" stroke="currentColor" stroke-width="1.8"/><circle cx="7" cy="7" r="0.9" fill="currentColor"/><circle cx="10" cy="7" r="0.9" fill="currentColor"/></svg>`,
	knowledge: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 5a2 2 0 0 1 2-2h11a3 3 0 0 1 3 3v14H7a3 3 0 0 1-3-3z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/><line x1="8" y1="8" x2="16" y2="8" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/><line x1="8" y1="12" x2="16" y2="12" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/><line x1="8" y1="16" x2="13" y2="16" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>`,
	configuration: `<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="3" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" fill="none" stroke="currentColor" stroke-width="1.6"/></svg>`,
	settings: `<svg viewBox="0 0 24 24" aria-hidden="true"><line x1="3" y1="6" x2="21" y2="6" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><line x1="3" y1="12" x2="21" y2="12" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><line x1="3" y1="18" x2="21" y2="18" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><circle cx="8" cy="6" r="2" fill="var(--mcpv-bg)"/><circle cx="16" cy="12" r="2" fill="var(--mcpv-bg)"/><circle cx="10" cy="18" r="2" fill="var(--mcpv-bg)"/></svg>`,
};

const NAV_GROUPS: ReadonlyArray<{
	readonly label: string;
	readonly tabs: ReadonlyArray<string>;
}> = [
	{
		label: 'Workspace',
		tabs: ['overview', 'tools', 'plugins', 'health', 'docs'],
	},
	{ label: 'Delivery', tabs: ['proposals', 'agents'] },
	{ label: 'Knowledge', tabs: ['memory'] },
	{ label: 'Insights', tabs: ['kpis'] },
	{ label: 'Preferences', tabs: ['settings'] },
];

export function buildTabsBar(lang: ILangDict): string {
	const text = (
		key: string,
		fallbackOrVars?: string | Readonly<Record<string, string | number>>,
		vars?: Readonly<Record<string, string | number>>,
	) => extensionText(lang, key, fallbackOrVars, vars);
	// WAI-ARIA tabs (H27): the tablist uses a roving tabindex —
	// only the selected tab is in the tab order (tabindex="0"); the
	// rest are `-1` and reachable via ArrowLeft/ArrowRight (wired in
	// the dashboard client script). The docs tab is a real tab
	// (controls panel-docs); the refresh button is an action, not a
	// tab, so it stays out of the roving tabindex.
	//
	// f00102 S4-real-extract: this used to inline its own button
	// markup with `class="mcpv-tabs"`. It now delegates to the shared
	// `renderTabs` so the docs site, the extension dashboard, and
	// every future surface emit the same `<nav class="mcpv-tabs__bar">`
	// tree. `idPrefix: ''` keeps the dashboard's existing
	// `id="tab-{id}"` / `aria-controls="panel-{id}"` convention
	// (which the client script + 9 panel builders already match
	// against). The refresh button is rendered after the tabs as
	// an `<li class="mcpv-tabs__action">` — no `role="tab"`, no
	// `data-tab-trigger`, so it stays out of the keyboard loop.
	const tabItems = TABS.map((tab) => ({
		id: tab.id,
		label: text(tab.label, tab.fallback),
	}));
	const refreshHtml = `<button class="mcpv-tabs__action-btn" id="tab-refresh" data-action="refresh" type="button" title="${text('refreshDashboard')}" aria-label="${text('refreshDashboard')}">${REFRESH_ICON}</button>`;
	const expandHtml = `<button class="mcpv-tabs__action-btn" id="tab-expand" data-action="expand" type="button" title="${text('openDashboardInTab', 'Open dashboard in a tab')}" aria-label="${text('openDashboardInTab', 'Open dashboard in a tab')}">${EXPAND_ICON}</button>`;
	const sidebarRefreshHtml = refreshHtml.replace(' id="tab-refresh"', '');
	const sidebarExpandHtml = expandHtml.replace(' id="tab-expand"', '');
	const surfaceActions = `
		<div class="mcpv-tabs__surface-actions" role="group" aria-label="${text('dashboardSections', 'Dashboard sections')}">
			<button class="mcpv-tabs__action-btn" data-surface="proposals" type="button" title="${text('openProposalBoard')}" aria-label="${text('openProposalBoard')}">${SURFACE_ICONS.proposals}</button>
			<button class="mcpv-tabs__action-btn" data-surface="knowledge" type="button" title="${text('openKnowledge')}" aria-label="${text('openKnowledge')}">${SURFACE_ICONS.knowledge}</button>
			<button class="mcpv-tabs__action-btn" data-surface="configuration" type="button" title="${text('openConfigurationCenter')}" aria-label="${text('openConfigurationCenter')}">${SURFACE_ICONS.configuration}</button>
			<button class="mcpv-tabs__action-btn" data-surface="settings" type="button" title="${text('openSettings')}" aria-label="${text('openSettings')}">${SURFACE_ICONS.settings}</button>
		</div>`;
	const sidebar = NAV_GROUPS.map(
		(group) =>
			`<details class="mcpv-app-nav__group" open><summary>${group.label}<span aria-hidden="true">⌄</span></summary><div class="mcpv-app-nav__items">${group.tabs
				.map((id) => {
					const tab = TABS.find((item) => item.id === id);
					return tab === undefined
						? ''
						: `<button type="button" class="mcpv-app-nav__item" data-sidebar-trigger="${tab.id}" aria-current="${tab.id === 'overview' ? 'page' : 'false'}"><span>${text(tab.label, tab.fallback)}</span></button>`;
				})
				.join('')}</div></details>`,
	).join('');
	return (
		`<div class="mcpv-app-nav__mobile"><button type="button" class="mcpv-app-nav__menu" data-nav-toggle aria-expanded="false">☰ <span>Menu</span></button></div>` +
		`<aside class="mcpv-app-nav" data-nav-panel aria-label="${text('dashboardSections', 'Dashboard sections')}">${sidebar}<div class="mcpv-app-nav__actions">${surfaceActions}${sidebarRefreshHtml}${sidebarExpandHtml}</div></aside>` +
		`<div class="mcpv-content"><section class="mcpv-tabs mcpv-tabs--underline">` +
		renderTabs({
			tabs: tabItems,
			variant: 'underline',
			label: text('dashboardSections', 'Dashboard sections'),
			idPrefix: '',
			actionHtml: `${surfaceActions}${refreshHtml}${expandHtml}`,
		}) +
		`</section></div>`
	);
}

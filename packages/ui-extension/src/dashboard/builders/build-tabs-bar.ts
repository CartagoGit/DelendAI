import type { ILangDict } from '@mcp-vertex/shared/i18n';
import { renderTabs } from '@mcp-vertex/shared/components/ui/tabs';

import { extensionText } from '../../i18n/extension-text';

export const TABS: ReadonlyArray<{ id: string; label: string }> = [
	{ id: 'status', label: 'tabStatus' },
	{ id: 'overview', label: 'tabOverview' },
	{ id: 'logs', label: 'tabLogs' },
	{ id: 'metrics', label: 'tabMetrics' },
	{ id: 'tokens', label: 'tabTokens' },
	{ id: 'spend', label: 'tabSpend' },
	{ id: 'tools', label: 'tabTools' },
	{ id: 'plugins', label: 'tabPlugins' },
	{ id: 'sessions', label: 'tabSessions' },
	{ id: 'times', label: 'tabTimes' },
	{ id: 'agents', label: 'tabAgents' },
	{ id: 'memory', label: 'tabMemory' },
	{ id: 'health', label: 'tabHealth' },
	{ id: 'settings', label: 'tabSettings' },
];

const NAV_GROUPS: ReadonlyArray<{
	readonly label: string;
	readonly tabs: ReadonlyArray<string>;
}> = [
	{
		label: 'Workspace',
		tabs: ['status', 'overview', 'logs', 'tools', 'plugins', 'docs'],
	},
	{ label: 'Operations', tabs: ['sessions', 'agents', 'health'] },
	{ label: 'Telemetry', tabs: ['metrics', 'tokens', 'spend', 'times'] },
	{ label: 'Knowledge', tabs: ['memory'] },
	{ label: 'Preferences', tabs: ['settings'] },
];

export function buildTabsBar(lang: ILangDict): string {
	const text = (
		key: string,
		vars?: Readonly<Record<string, string | number>>,
	) => extensionText(lang, key, vars);
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
		label: text(tab.label),
	}));
	const docsTab = { id: 'docs', label: text('tabDocs') };
	const refreshHtml = `<button class="mcpv-tabs__action-btn" id="tab-refresh" data-action="refresh" type="button" title="${text('refreshDashboard')}" aria-label="${text('refreshDashboard')}">⟳</button>`;
	const expandHtml = `<button class="mcpv-tabs__action-btn" id="tab-expand" data-action="expand" type="button" title="${text('openDashboardInTab', 'Open dashboard in a tab')}" aria-label="${text('openDashboardInTab', 'Open dashboard in a tab')}">↗</button>`;
	const sidebarRefreshHtml = refreshHtml.replace(' id="tab-refresh"', '');
	const sidebarExpandHtml = expandHtml.replace(' id="tab-expand"', '');
	const surfaceActions = `
		<div class="mcpv-tabs__surface-actions" role="group" aria-label="${text('tabOverview')}">
			<button class="mcpv-tabs__action-btn" data-surface="proposals" type="button" title="${text('openProposalBoard')}" aria-label="${text('openProposalBoard')}">▤</button>
			<button class="mcpv-tabs__action-btn" data-surface="knowledge" type="button" title="${text('openKnowledge')}" aria-label="${text('openKnowledge')}">⌘</button>
			<button class="mcpv-tabs__action-btn" data-surface="configuration" type="button" title="${text('openConfigurationCenter')}" aria-label="${text('openConfigurationCenter')}">⚙</button>
			<button class="mcpv-tabs__action-btn" data-surface="settings" type="button" title="${text('openSettings')}" aria-label="${text('openSettings')}">☷</button>
		</div>`;
	const sidebar = NAV_GROUPS.map(
		(group) =>
			`<details class="mcpv-app-nav__group" open><summary>${group.label}<span aria-hidden="true">⌄</span></summary><div class="mcpv-app-nav__items">${group.tabs
				.map((id) => {
					const tab =
						id === 'docs'
							? docsTab
							: TABS.find((item) => item.id === id);
					return tab === undefined
						? ''
						: `<button type="button" class="mcpv-app-nav__item" data-sidebar-trigger="${tab.id}" aria-current="${tab.id === 'overview' ? 'page' : 'false'}"><span>${text(tab.label)}</span></button>`;
				})
				.join('')}</div></details>`,
	).join('');
	return (
		`<div class="mcpv-app-nav__mobile"><button type="button" class="mcpv-app-nav__menu" data-nav-toggle aria-expanded="false">☰ <span>Menu</span></button></div>` +
		`<aside class="mcpv-app-nav" data-nav-panel aria-label="Dashboard sections">${sidebar}<div class="mcpv-app-nav__actions">${surfaceActions}${sidebarRefreshHtml}${sidebarExpandHtml}</div></aside>` +
		`<section class="mcpv-tabs mcpv-tabs--underline">` +
		renderTabs({
			tabs: [...tabItems, docsTab],
			variant: 'underline',
			label: text('tabOverview'),
			idPrefix: '',
			actionHtml: `${surfaceActions}${refreshHtml}${expandHtml}`,
		}) +
		`</section>`
	);
}

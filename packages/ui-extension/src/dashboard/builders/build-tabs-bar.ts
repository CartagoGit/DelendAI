import type { ILangDict } from '@mcp-vertex/shared/i18n';
import { extensionText } from '../../i18n/extension-text';
import { escapeHtml } from '../format';

export const TABS: ReadonlyArray<{ id: string; label: string }> = [
	{ id: 'overview', label: 'tabOverview' },
	{ id: 'metrics', label: 'tabMetrics' },
	{ id: 'tokens', label: 'tabTokens' },
	{ id: 'tools', label: 'tabTools' },
	{ id: 'plugins', label: 'tabPlugins' },
	{ id: 'sessions', label: 'tabSessions' },
	{ id: 'times', label: 'tabTimes' },
	{ id: 'agents', label: 'tabAgents' },
	{ id: 'health', label: 'tabHealth' },
];

export function buildTabsBar(lang: ILangDict): string {
	const text = (key: string, vars?: Readonly<Record<string, string | number>>) =>
		extensionText(lang, key, vars);
	// WAI-ARIA tabs (H27): each tab points at the panel it controls via
	// `aria-controls`, and the tablist uses a roving tabindex — only the
	// selected tab is in the tab order (tabindex="0"); the rest are
	// `-1` and reachable via ArrowLeft/ArrowRight (wired in the dashboard
	// client script). The docs tab is a real tab (controls panel-docs);
	// the refresh button is an action, not a tab, so it keeps the normal
	// tab order and no aria-controls.
	const tabButton = (
		id: string,
		label: string,
		selected: boolean,
	): string =>
		`<button class="mv-tab" id="tab-${id}" role="tab" aria-controls="panel-${id}" aria-selected="${selected ? 'true' : 'false'}" tabindex="${selected ? '0' : '-1'}" data-target="${id}">${escapeHtml(label)}</button>`;

	const tabsHtml = TABS.map((tab, ix) =>
		tabButton(tab.id, text(tab.label), ix === 0),
	).join('');
	const docsTab = tabButton('docs', text('tabDocs'), false);

	return `<div class="mv-tabs" role="tablist">${tabsHtml}${docsTab}<button class="mv-tab" id="tab-refresh" data-action="refresh" title="${escapeHtml(text('refreshDashboard'))}">⟳</button></div>`;
}

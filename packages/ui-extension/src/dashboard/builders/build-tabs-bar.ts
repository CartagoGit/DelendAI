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
	const tabsHtml = TABS.map(
		(tab, ix) =>
			`<button class="mv-tab" id="tab-${tab.id}" role="tab" aria-selected="${ix === 0 ? 'true' : 'false'}" data-target="${tab.id}">${escapeHtml(text(tab.label))}</button>`,
	).join('');

	return `<div class="mv-tabs" role="tablist">${tabsHtml}<button class="mv-tab" id="tab-docs" role="tab" data-target="docs">${escapeHtml(text('tabDocs'))}</button><button class="mv-tab" id="tab-refresh" role="tab" data-action="refresh" title="${escapeHtml(text('refreshDashboard'))}">⟳</button></div>`;
}

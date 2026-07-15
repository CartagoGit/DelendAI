import type { ILangDict } from '@mcp-vertex/shared/i18n';
import { renderTabs } from '@mcp-vertex/shared/components/ui/tabs';

import { extensionText } from '../../i18n/extension-text';

export const TABS: ReadonlyArray<{ id: string; label: string }> = [
	{ id: 'overview', label: 'tabOverview' },
	{ id: 'metrics', label: 'tabMetrics' },
	{ id: 'tokens', label: 'tabTokens' },
	{ id: 'spend', label: 'tabSpend' },
	{ id: 'tools', label: 'tabTools' },
	{ id: 'plugins', label: 'tabPlugins' },
	{ id: 'sessions', label: 'tabSessions' },
	{ id: 'times', label: 'tabTimes' },
	{ id: 'agents', label: 'tabAgents' },
	{ id: 'health', label: 'tabHealth' },
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
	const refreshHtml = `<button class="mcpv-tabs__action-btn" id="tab-refresh" data-action="refresh" type="button" title="${text('refreshDashboard')}">⟳</button>`;
	return (
		`<section class="mcpv-tabs mcpv-tabs--underline">` +
		renderTabs({
			tabs: [...tabItems, docsTab],
			variant: 'underline',
			label: 'Dashboard sections',
			idPrefix: '',
			actionHtml: refreshHtml,
		}) +
		`</section>`
	);
}

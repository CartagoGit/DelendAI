import type { IDashboardAllModels } from '@mcp-vertex/client';
import type { ILangDict } from '@mcp-vertex/shared/i18n';
import { extensionText } from '../../i18n/extension-text';
import { escapeHtml } from '../format';
import { TABS } from './build-tabs-bar';

import { renderPanelOverview } from '../render-panel-overview';
import { renderPanelMetrics } from '../render-panel-metrics';
import { renderPanelTokens } from '../render-panel-tokens';
import { renderPanelTools } from '../render-panel-tools';
import { renderPanelPlugins } from '../render-panel-plugins';
import { renderPanelSessions } from '../render-panel-sessions';
import { renderPanelTimes } from '../render-panel-times';
import { renderPanelAgents } from '../render-panel-agents';
import { renderPanelHealth } from '../render-panel-health';

export function buildPanels(
	model: IDashboardAllModels,
	lang: ILangDict,
	docsUrl: string,
): string {
	const text = (key: string, vars?: Readonly<Record<string, string | number>>) =>
		extensionText(lang, key, vars);
	const overviewPanel = renderPanelOverview(model.overview, lang);
	const metricsPanel = renderPanelMetrics(model.metrics, lang);
	const tokensPanel = renderPanelTokens(model.tokens, lang);
	const toolsPanel = renderPanelTools(model.tools, lang);
	const pluginsPanel = renderPanelPlugins(model.plugins, lang);
	const sessionsPanel = renderPanelSessions(model.sessions, lang);
	const timesPanel = renderPanelTimes(model.times, lang);
	const agentsPanel = renderPanelAgents(model.agents, lang);
	const healthPanel = renderPanelHealth(model.health, lang);

	const docsPanel = `
<section class="mv-panel" id="panel-docs" role="tabpanel" aria-labelledby="tab-docs">
	<h2 class="mv-panel__title">${escapeHtml(text('dashboard.documentation'))}</h2>
	<iframe class="mv-docs-frame" src="${escapeHtml(docsUrl)}" referrerpolicy="no-referrer" sandbox="allow-scripts allow-same-origin"></iframe>
	<p class="mv-fg-muted">${escapeHtml(text('dashboard.docsEmbeddedFrom'))} <a href="${escapeHtml(docsUrl)}">${escapeHtml(docsUrl)}</a></p>
</section>
`;

	const firstActive = TABS[0]?.id ?? 'overview';

	return [
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
}

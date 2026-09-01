import type {
	IDashboardAllModels,
	IExtensionSettings,
} from '@mcp-vertex/client';
import type { ILangDict } from '@mcp-vertex/shared/i18n';
import { extensionText } from '../../i18n/extension-text';
import { escapeHtml } from '../format';
import { TABS } from './build-tabs-bar';

import { renderPanelStatus } from '../render-panel-status';
import { renderPanelOverview } from '../render-panel-overview';
import { renderPanelLogs } from '../render-panel-logs';
import { renderPanelMetrics } from '../render-panel-metrics';
import { renderPanelTokens } from '../render-panel-tokens';
import { renderPanelSpend } from '../render-panel-spend';
import { renderPanelTools } from '../render-panel-tools';
import { renderPanelPlugins } from '../render-panel-plugins';
import { renderPanelSessions } from '../render-panel-sessions';
import { renderPanelTimes } from '../render-panel-times';
import { renderPanelAgents } from '../render-panel-agents';
import { renderPanelHealth } from '../render-panel-health';
import { renderPanelMemory } from '../render-panel-memory';
import { renderPanelHelp } from '../render-panel-help';
import { renderPanelSettings } from '../render-panel-settings';

export interface IBuildPanelsOptions {
	readonly compact?: boolean;
}

export function buildPanels(
	model: IDashboardAllModels,
	lang: ILangDict,
	docsUrl: string,
	settings?: IExtensionSettings,
	options: IBuildPanelsOptions = {},
): string {
	const text = (
		key: string,
		vars?: Readonly<Record<string, string | number>>,
	) => extensionText(lang, key, vars);
	const statusPanel = renderPanelStatus(model, lang);
	const overviewPanel = renderPanelOverview(model.overview, lang);
	const logsPanel = renderPanelLogs(lang);
	const metricsPanel = renderPanelMetrics(model.metrics, lang);
	const tokensPanel = renderPanelTokens(model.tokens, lang);
	const spendPanel = renderPanelSpend(model.spend, lang);
	const toolsPanel = renderPanelTools(
		model.tools,
		lang,
		model.metrics.sparklines,
	);
	const pluginsPanel = renderPanelPlugins(model.plugins, lang);
	const sessionsPanel = renderPanelSessions(model.sessions, lang);
	const timesPanel = renderPanelTimes(model.times, lang);
	const agentsPanel = renderPanelAgents(model.agents, lang);
	const memoryPanel = renderPanelMemory(model.memory, lang);
	const healthPanel = renderPanelHealth(model.health, lang);
	const helpPanel = renderPanelHelp(lang);
	const settingsPanel = renderPanelSettings(
		settings ?? {
			docsUrl: 'https://mcp-vertex.dev',
			allowLocalhost: false,
			allowPrivateIps: false,
			logLevel: 'info',
			theme: 'system',
			language: 'en',
			motion: 'system',
		},
		lang,
		options.compact ?? false,
	);

	const docsPanel = `
<section class="mcpv-panel" id="panel-docs" role="tabpanel" aria-labelledby="tab-docs">
	<h2 class="mcpv-panel__title">${escapeHtml(text('dashboard.documentation'))}</h2>
	<iframe class="mcpv-docs-frame" src="${escapeHtml(docsUrl)}" referrerpolicy="no-referrer" sandbox="allow-scripts allow-same-origin"></iframe>
	<p class="mcpv-fg-muted">${escapeHtml(text('dashboard.docsEmbeddedFrom'))} <a href="${escapeHtml(docsUrl)}">${escapeHtml(docsUrl)}</a></p>
</section>
`;

	const firstActive = TABS[0]?.id ?? 'overview';

	return [
		statusPanel,
		overviewPanel,
		logsPanel,
		metricsPanel,
		tokensPanel,
		spendPanel,
		toolsPanel,
		pluginsPanel,
		sessionsPanel,
		timesPanel,
		agentsPanel,
		memoryPanel,
		healthPanel,
		helpPanel,
		settingsPanel,
		docsPanel,
	]
		.map((html, ix) => {
			const idMatch = html.match(/id="(panel-[a-z]+)"/);
			const id = idMatch?.[1] ?? `panel-${ix}`;
			const active = id === `panel-${firstActive}` ? 'true' : 'false';
			return html.replace(
				'<section class="mcpv-panel"',
				`<section class="mcpv-panel" data-active="${active}"`,
			);
		})
		.join('');
}

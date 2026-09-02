import type {
	IDashboardAllModels,
	IDashboardDataState,
	IExtensionSettings,
} from '@mcp-vertex/client';
import type { ILangDict } from '@mcp-vertex/shared/i18n';

import { extensionText } from '../../i18n/extension-text';
import { escapeHtml } from '../format';
import { renderPanelAgents } from '../render-panel-agents';
import { renderPanelHealth } from '../render-panel-health';
import { renderPanelLogs } from '../render-panel-logs';
import { renderPanelMemory } from '../render-panel-memory';
import { renderPanelMetrics } from '../render-panel-metrics';
import { renderPanelOverview } from '../render-panel-overview';
import { renderPanelPlugins } from '../render-panel-plugins';
import { renderPanelSessions } from '../render-panel-sessions';
import { renderPanelSettings } from '../render-panel-settings';
import { renderPanelSpend } from '../render-panel-spend';
import { renderPanelStatus } from '../render-panel-status';
import { renderPanelTimes } from '../render-panel-times';
import { renderPanelTokens } from '../render-panel-tokens';
import { renderPanelTools } from '../render-panel-tools';
import { TABS } from './build-tabs-bar';

interface IPanelFragment {
	readonly title: string;
	readonly body: string;
}

type IWorkspacePanelState = IDashboardDataState | 'error';

const extractPanelFragment = (
	html: string,
	fallbackTitle: string,
): IPanelFragment => {
	const sectionMatch = html.match(/<section[^>]*>([\s\S]*)<\/section>\s*$/);
	const inner = sectionMatch?.[1]?.trim() ?? html.trim();
	const titleMatch = inner.match(
		/<h2 class="mcpv-panel__title">([\s\S]*?)<\/h2>/,
	);
	return {
		title: titleMatch?.[1]?.trim() ?? fallbackTitle,
		body: inner
			.replace(/<h2 class="mcpv-panel__title">[\s\S]*?<\/h2>/, '')
			.trim(),
	};
};

const renderStateCard = (
	title: string,
	tone: 'loading' | 'empty' | 'error' | 'unavailable',
	message: string,
): string => `<div class="mcpv-card mcpv-shell-state" data-state-tone="${tone}">
	<h3 class="mcpv-card__title">${escapeHtml(title)}</h3>
	<p>${escapeHtml(message)}</p>
</div>`;

const renderPanelSection = (
	title: string,
	body: string,
	lead?: string,
): string => {
	if (body.trim().length === 0) {
		return renderStateCard(
			title,
			'error',
			'Unable to render this dashboard section.',
		);
	}
	return `<section class="mcpv-shell-section">
		<header class="mcpv-shell-section__head">
			<h3 class="mcpv-shell-section__title">${escapeHtml(title)}</h3>
			${lead === undefined ? '' : `<p class="mcpv-fg-muted">${escapeHtml(lead)}</p>`}
		</header>
		${body}
	</section>`;
};

const renderWorkspacePanel = (
	id: string,
	title: string,
	state: IWorkspacePanelState,
	body: string,
	text: (
		key: string,
		fallbackOrVars?: string | Readonly<Record<string, string | number>>,
		vars?: Readonly<Record<string, string | number>>,
	) => string,
	lead?: string,
): string => {
	const stateBody =
		state === 'loading'
			? renderStateCard(
					title,
					'loading',
					text(
						'dashboard.state.loading',
						'Loading live workspace data for this section...',
					),
				)
			: state === 'empty'
				? renderStateCard(
						title,
						'empty',
						text(
							'dashboard.state.empty',
							'No workspace data is available for this section yet.',
						),
					)
				: state === 'unavailable'
					? renderStateCard(
							title,
							'unavailable',
							text(
								'dashboard.state.unavailable',
								'This section is unavailable because the backing plugin or host capability is not loaded.',
							),
						)
					: state === 'error'
						? renderStateCard(
								title,
								'error',
								text(
									'dashboard.state.error',
									'This section returned an invalid payload and could not be rendered.',
								),
							)
						: body.trim().length === 0
							? renderStateCard(
									title,
									'error',
									text(
										'dashboard.state.error',
										'This section returned an invalid payload and could not be rendered.',
									),
								)
							: body;
	return `
<section class="mcpv-panel mcpv-panel--shell" id="panel-${id}" role="tabpanel" aria-labelledby="tab-${id}">
	<h2 class="mcpv-panel__title">${escapeHtml(title)}</h2>
	${lead === undefined ? '' : `<p class="mcpv-fg-muted">${escapeHtml(lead)}</p>`}
	<div class="mcpv-shell-stack">${stateBody}</div>
</section>
`;
};

const docsSummary = (
	model: IDashboardAllModels,
	text: (
		key: string,
		fallbackOrVars?: string | Readonly<Record<string, string | number>>,
		vars?: Readonly<Record<string, string | number>>,
	) => string,
	docsUrl: string,
): string => {
	const knowledge = model.docs.knowledge
		.slice(0, 6)
		.map(
			(entry) =>
				`<li><code>${escapeHtml(entry.id)}</code>${entry.title === undefined ? '' : ` <span class="mcpv-fg-muted">${escapeHtml(entry.title)}</span>`}</li>`,
		)
		.join('');
	return `<div class="mcpv-grid">
		<div class="mcpv-card mcpv-card--third">
			<h3 class="mcpv-card__title">${escapeHtml(text('dashboard.docs.status', 'Docs source'))}</h3>
			<p class="mcpv-kpi__value">${escapeHtml(model.docs.pluginLoaded ? text('common.ready', 'Ready') : text('dashboard.state.unavailableShort', 'Unavailable'))}</p>
			<p class="mcpv-kpi__hint">${escapeHtml(text('dashboard.docsEmbeddedFrom'))} ${escapeHtml(docsUrl)}</p>
		</div>
		<div class="mcpv-card mcpv-card--third">
			<h3 class="mcpv-card__title">${escapeHtml(text('tabTools', 'Tools'))}</h3>
			<p class="mcpv-kpi__value">${escapeHtml(String(model.docs.tools.length))}</p>
			<p class="mcpv-kpi__hint">${escapeHtml(text('dashboard.docs.toolsLead', 'Tools documented in the current docs context.'))}</p>
		</div>
		<div class="mcpv-card mcpv-card--third">
			<h3 class="mcpv-card__title">${escapeHtml(text('dashboard.overview.knowledge', 'Knowledge'))}</h3>
			<p class="mcpv-kpi__value">${escapeHtml(String(model.docs.knowledge.length))}</p>
			<p class="mcpv-kpi__hint">${escapeHtml(text('dashboard.docs.knowledgeLead', 'Knowledge packs advertised by the current workspace.'))}</p>
		</div>
		<div class="mcpv-card mcpv-card--half">
			<h3 class="mcpv-card__title">${escapeHtml(text('dashboard.overview.recommendedNextAction', 'Recommended next action'))}</h3>
			<pre>${escapeHtml(model.docs.recommendedNextAction)}</pre>
		</div>
		<div class="mcpv-card mcpv-card--half">
			<h3 class="mcpv-card__title">${escapeHtml(text('dashboard.overview.knowledge', 'Knowledge'))}</h3>
			${knowledge.length === 0 ? `<p class="mcpv-fg-muted">${escapeHtml(text('dashboard.memory.none', 'No entries yet.'))}</p>` : `<ul>${knowledge}</ul>`}
		</div>
	</div>`;
};

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
	const memoryState =
		(model.memory.state as IWorkspacePanelState | undefined) ??
		(model.memory.notes.length === 0 && model.memory.total === 0
			? 'empty'
			: 'ready');
	const docsModel =
		model.docs ??
		({
			pluginLoaded: true,
			tools: model.overview.tools.map((tool) => tool.name),
			knowledge: model.overview.knowledgeIds.map((id) => ({ id })),
			recommendedNextAction: model.overview.recommendedNextAction,
		} satisfies IDashboardAllModels['docs']);
	const proposalsModel = model.proposals ?? model.sessions;
	const text = (
		key: string,
		fallbackOrVars?: string | Readonly<Record<string, string | number>>,
		vars?: Readonly<Record<string, string | number>>,
	) => extensionText(lang, key, fallbackOrVars, vars);
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
	const sessionsPanel = renderPanelSessions(proposalsModel, lang);
	const timesPanel = renderPanelTimes(model.times, lang);
	const agentsPanel = renderPanelAgents(model.agents, lang);
	const memoryPanel = renderPanelMemory(model.memory, lang);
	const healthPanel = renderPanelHealth(model.health, lang);
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
	const sections = model.workspace ?? {
		overview: { state: 'ready', data: model.overview },
		tools: {
			state: model.tools.rows.length === 0 ? 'empty' : 'ready',
			data: model.tools,
		},
		plugins: {
			state: model.plugins.rows.length === 0 ? 'empty' : 'ready',
			data: model.plugins,
		},
		memory: {
			state: memoryState,
			data: model.memory,
		},
		proposals: {
			state: model.sessions.rows.length === 0 ? 'empty' : 'ready',
			data: model.sessions,
		},
		agents: {
			state: model.agents.agents.length === 0 ? 'empty' : 'ready',
			data: model.agents,
		},
		kpis: { state: 'ready', data: model.kpis },
		health: { state: 'ready', data: model.health },
		docs: {
			state: 'ready',
			data: docsModel,
		},
	};
	const overviewBody = [
		renderPanelSection(
			text('tabOverview', 'Overview'),
			extractPanelFragment(overviewPanel, text('tabOverview', 'Overview'))
				.body,
			text(
				'dashboard.shell.overviewLead',
				'Current connection, inventory and next action for this workspace.',
			),
		),
		renderPanelSection(
			text('tabLogs', 'Logs'),
			extractPanelFragment(logsPanel, text('tabLogs', 'Logs')).body,
			text(
				'dashboard.shell.logsLead',
				'Realtime MCP events stay inside the shell instead of a separate tab.',
			),
		),
		renderPanelSection(
			text('tabHealth', 'Health'),
			extractPanelFragment(healthPanel, text('tabHealth', 'Health')).body,
		),
	].join('');
	const toolsBody = renderPanelSection(
		text('tabTools', 'Tools'),
		extractPanelFragment(toolsPanel, text('tabTools', 'Tools')).body,
		text(
			'dashboard.shell.toolsLead',
			'Use the shared tools table as the canonical inventory and jump-off point.',
		),
	);
	const proposalsBody = renderPanelSection(
		text('tabSessions', 'Proposals'),
		extractPanelFragment(sessionsPanel, text('tabSessions', 'Proposals'))
			.body,
		text(
			'dashboard.shell.proposalsLead',
			'Active work and proposal status now live in a dedicated shell destination.',
		),
	);
	const agentsBody = renderPanelSection(
		text('tabAgents', 'Agents'),
		extractPanelFragment(agentsPanel, text('tabAgents', 'Agents')).body,
		text(
			'dashboard.shell.agentsLead',
			'Current agents, slice ownership and proposal context.',
		),
	);
	const memoryBody = renderPanelSection(
		text('tabMemory', 'Memory'),
		extractPanelFragment(memoryPanel, text('tabMemory', 'Memory')).body,
		text(
			'dashboard.shell.memoryLead',
			'Durable notes stay in the shared shell and expose empty or unavailable states explicitly.',
		),
	);
	const kpisBody = [
		renderPanelSection(
			text('tabMetrics', 'Metrics'),
			extractPanelFragment(metricsPanel, text('tabMetrics', 'Metrics'))
				.body,
		),
		renderPanelSection(
			text('tabTokens', 'Tokens'),
			extractPanelFragment(tokensPanel, text('tabTokens', 'Tokens')).body,
		),
		renderPanelSection(
			text('tabSpend', 'Spend'),
			extractPanelFragment(spendPanel, text('tabSpend', 'Spend')).body,
		),
		renderPanelSection(
			text('tabTimes', 'Latency'),
			extractPanelFragment(timesPanel, text('tabTimes', 'Latency')).body,
		),
	].join('');
	const pluginsBody = renderPanelSection(
		text('tabPlugins', 'Plugins'),
		extractPanelFragment(pluginsPanel, text('tabPlugins', 'Plugins')).body,
		text(
			'dashboard.shell.pluginsLead',
			'Per-plugin rollups and token share stay on the shared UI path.',
		),
	);
	const docsBody = [
		renderPanelSection(
			text('tabDocs', 'Docs'),
			docsSummary({ ...model, docs: docsModel }, text, docsUrl),
			text(
				'dashboard.shell.docsLead',
				'Docs availability is explicit before the iframe loads.',
			),
		),
		`<div class="mcpv-card"><iframe class="mcpv-docs-frame" src="${escapeHtml(docsUrl)}" referrerpolicy="no-referrer" sandbox="allow-scripts allow-same-origin"></iframe><p class="mcpv-fg-muted">${escapeHtml(text('dashboard.docsEmbeddedFrom'))} <a href="${escapeHtml(docsUrl)}">${escapeHtml(docsUrl)}</a></p></div>`,
	].join('');
	const settingsBody = renderPanelSection(
		text('tabSettings', 'Configuration'),
		extractPanelFragment(
			settingsPanel,
			text('tabSettings', 'Configuration'),
		).body,
		text(
			'dashboard.shell.settingsLead',
			'Host settings, docs URL and diagnostics stay editable from the main shell.',
		),
	);

	const firstActive = TABS[0]?.id ?? 'overview';

	return [
		renderWorkspacePanel(
			'status',
			text('tabStatus', 'Status'),
			sections.overview.state,
			renderPanelSection(
				text('tabStatus', 'Status'),
				extractPanelFragment(statusPanel, text('tabStatus', 'Status'))
					.body,
				text(
					'dashboard.shell.statusLead',
					'Live activity, connection state and current MCP posture.',
				),
			),
			text,
		),
		renderWorkspacePanel(
			'overview',
			text('tabOverview', 'Overview'),
			sections.overview.state,
			overviewBody,
			text,
			text(
				'dashboard.shell.overviewShellLead',
				'One landing zone for server identity, activity, health and live logs.',
			),
		),
		renderWorkspacePanel(
			'tools',
			text('tabTools', 'Tools'),
			sections.tools.state,
			toolsBody,
			text,
		),
		renderWorkspacePanel(
			'memory',
			text('tabMemory', 'Memory'),
			sections.memory.state,
			memoryBody,
			text,
		),
		renderWorkspacePanel(
			'proposals',
			text('tabSessions', 'Proposals'),
			sections.proposals.state,
			proposalsBody,
			text,
		),
		renderWorkspacePanel(
			'agents',
			text('tabAgents', 'Agents'),
			sections.agents.state,
			agentsBody,
			text,
		),
		renderWorkspacePanel(
			'kpis',
			text('dashboard.kpis.title', 'KPIs'),
			sections.kpis.state,
			kpisBody,
			text,
			text(
				'dashboard.shell.kpisLead',
				'Operational metrics, tokens, spend and latency in one place.',
			),
		),
		renderWorkspacePanel(
			'plugins',
			text('tabPlugins', 'Plugins'),
			sections.plugins.state,
			pluginsBody,
			text,
		),
		renderWorkspacePanel(
			'health',
			text('tabHealth', 'Health'),
			sections.health.state,
			renderPanelSection(
				text('tabHealth', 'Health'),
				extractPanelFragment(healthPanel, text('tabHealth', 'Health'))
					.body,
			),
			text,
		),
		renderWorkspacePanel(
			'docs',
			text('tabDocs', 'Docs'),
			sections.docs.state,
			docsBody,
			text,
		),
		renderWorkspacePanel(
			'settings',
			text('tabSettings', 'Configuration'),
			'ready',
			settingsBody,
			text,
		),
		renderPanelMetrics(model.metrics, lang),
		renderPanelTokens(model.tokens, lang),
		renderPanelSpend(model.spend, lang),
		renderPanelSessions(model.sessions, lang),
		renderPanelTimes(model.times, lang),
	]
		.map((html, ix) => {
			const idMatch = html.match(/id="(panel-[a-z]+)"/);
			const id = idMatch?.[1] ?? `panel-${ix}`;
			const active = id === `panel-${firstActive}` ? 'true' : 'false';
			return html.replace(
				/<section class="mcpv-panel([^"]*)"/,
				`<section class="mcpv-panel$1" data-active="${active}"`,
			);
		})
		.join('');
}

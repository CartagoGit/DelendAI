/**
 * `renderPanelOverview` — server identity, plugin + tool counts,
 * recommended next action. The simplest of the 8 panels.
 */
import type { IDashboardOverviewModel } from '@mcp-vertex/client';
import type { ILangDict } from '@mcp-vertex/shared/i18n';

import { extensionText } from '../i18n/extension-text';
import { escapeHtml, formatNumber } from './format';

export const renderPanelOverview = (
	model: IDashboardOverviewModel,
	lang: ILangDict,
): string => {
	const text = (key: string, vars?: Readonly<Record<string, string | number>>) =>
		extensionText(lang, key, vars);
	const pluginRows = model.plugins
		.map(
			(p) =>
				`<li><code>${escapeHtml(p.name)}</code>${p.version === undefined ? '' : ` <span class="mv-fg-muted">v${escapeHtml(p.version)}</span>`}</li>`,
		)
		.join('');
	const knowledgeRows = model.knowledgeIds
		.map((id) => `<li><code>${escapeHtml(id)}</code></li>`)
		.join('');

	return `
<section class="mv-panel" id="panel-overview" role="tabpanel" aria-labelledby="tab-overview">
	<h2 class="mv-panel__title">${escapeHtml(text('tabOverview'))}</h2>
	<div class="mv-grid">
		<div class="mv-card mv-card--half">
			<h3 class="mv-card__title">${escapeHtml(text('dashboard.overview.server'))}</h3>
			<p><strong>${escapeHtml(model.serverName)}</strong> v${escapeHtml(model.serverVersion)}</p>
			<p class="mv-fg-muted">${escapeHtml(text('dashboard.overview.namespacePrefix'))}: <code>${escapeHtml(model.namespacePrefix)}</code></p>
			<p>${escapeHtml(text('dashboard.overview.recommendedNextAction'))}:</p>
			<pre>${escapeHtml(model.recommendedNextAction)}</pre>
		</div>
		<div class="mv-card mv-card--half">
			<h3 class="mv-card__title">${escapeHtml(text('tabPlugins'))} (${formatNumber(model.plugins.length)})</h3>
			<ul>${pluginRows}</ul>
		</div>
		<div class="mv-card mv-card--half">
			<h3 class="mv-card__title">${escapeHtml(text('tabTools'))} (${formatNumber(model.tools.length)})</h3>
			<ul>${model.tools
				.slice(0, 12)
				.map((t) => `<li><code>${escapeHtml(t.name)}</code></li>`)
				.join('')}</ul>
			${model.tools.length > 12 ? `<p class="mv-fg-muted">${escapeHtml(text('dashboard.overview.toolsMore', { count: model.tools.length - 12 }))}</p>` : ''}
		</div>
		<div class="mv-card mv-card--half">
			<h3 class="mv-card__title">${escapeHtml(text('dashboard.overview.knowledge'))} (${formatNumber(model.knowledgeIds.length)})</h3>
			<ul>${knowledgeRows}</ul>
		</div>
	</div>
</section>
`;
};

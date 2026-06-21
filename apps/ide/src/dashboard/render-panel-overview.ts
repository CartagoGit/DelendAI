/**
 * `renderPanelOverview` — server identity, plugin + tool counts,
 * recommended next action. The simplest of the 8 panels.
 */
import type { IDashboardOverviewModel } from '@mcp-vertex/client';

import { escapeHtml, formatNumber } from './format';

export const renderPanelOverview = (model: IDashboardOverviewModel): string => {
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
	<h2 class="mv-panel__title">Overview</h2>
	<div class="mv-grid">
		<div class="mv-card mv-card--half">
			<h3 class="mv-card__title">Server</h3>
			<p><strong>${escapeHtml(model.serverName)}</strong> v${escapeHtml(model.serverVersion)}</p>
			<p class="mv-fg-muted">Namespace prefix: <code>${escapeHtml(model.namespacePrefix)}</code></p>
			<p>Recommended next action:</p>
			<pre>${escapeHtml(model.recommendedNextAction)}</pre>
		</div>
		<div class="mv-card mv-card--half">
			<h3 class="mv-card__title">Plugins (${formatNumber(model.plugins.length)})</h3>
			<ul>${pluginRows}</ul>
		</div>
		<div class="mv-card mv-card--half">
			<h3 class="mv-card__title">Tools (${formatNumber(model.tools.length)})</h3>
			<ul>${model.tools
				.slice(0, 12)
				.map((t) => `<li><code>${escapeHtml(t.name)}</code></li>`)
				.join('')}</ul>
			${model.tools.length > 12 ? `<p class="mv-fg-muted">… ${model.tools.length - 12} more in the Tools tab.</p>` : ''}
		</div>
		<div class="mv-card mv-card--half">
			<h3 class="mv-card__title">Knowledge (${formatNumber(model.knowledgeIds.length)})</h3>
			<ul>${knowledgeRows}</ul>
		</div>
	</div>
</section>
`;
};

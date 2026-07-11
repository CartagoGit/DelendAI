/**
 * `renderPanelSessions` — active proposals, grouped by status.
 */
import type { IDashboardSessionsModel } from '@mcp-vertex/client';
import type { ILangDict } from '@mcp-vertex/shared/i18n';

import { extensionText } from '../i18n/extension-text';
import { escapeHtml, formatNumber } from './format';

export const renderPanelSessions = (
	model: IDashboardSessionsModel,
	lang: ILangDict,
): string => {
	const text = (
		key: string,
		vars?: Readonly<Record<string, string | number>>,
	) => extensionText(lang, key, vars);
	const byStatus = Object.entries(model.byStatus)
		.map(([status, count]) => {
			const pills = model.rows
				.filter((r) => r.status === status)
				.map(
					(r) => `<div class="mcpv-row">
						<span class="mcpv-row__pill" data-status="${escapeHtml(r.status)}">${escapeHtml(r.status)}</span>
						<a href="#" data-proposal="${escapeHtml(r.id)}"><code>${escapeHtml(r.id)}</code></a>
						<span class="mcpv-fg-muted">${escapeHtml(r.title)}</span>
						<span class="mcpv-fg-muted">${escapeHtml(r.track)}</span>
					</div>`,
				)
				.join('');
			return `<div class="mcpv-card">
				<h3 class="mcpv-card__title">${escapeHtml(status)} (${formatNumber(count)})</h3>
				${pills}
			</div>`;
		})
		.join('');

	return `
<section class="mcpv-panel" id="panel-sessions" role="tabpanel" aria-labelledby="tab-sessions">
	<h2 class="mcpv-panel__title">${escapeHtml(text('tabSessions'))}</h2>
	<p>${escapeHtml(text('dashboard.sessions.activeProposals', { count: formatNumber(model.total) }))}</p>
	<div class="mcpv-grid">
		${byStatus || `<p class="mcpv-fg-muted">${escapeHtml(text('dashboard.sessions.none'))}</p>`}
	</div>
</section>
`;
};

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
	const text = (key: string, vars?: Readonly<Record<string, string | number>>) =>
		extensionText(lang, key, vars);
	const byStatus = Object.entries(model.byStatus)
		.map(([status, count]) => {
			const pills = model.rows
				.filter((r) => r.status === status)
				.map(
					(r) => `<div class="mv-row">
						<span class="mv-row__pill" data-status="${escapeHtml(r.status)}">${escapeHtml(r.status)}</span>
						<a href="#" data-proposal="${escapeHtml(r.id)}"><code>${escapeHtml(r.id)}</code></a>
						<span class="mv-fg-muted">${escapeHtml(r.title)}</span>
						<span class="mv-fg-muted">${escapeHtml(r.track)}</span>
					</div>`,
				)
				.join('');
			return `<div class="mv-card">
				<h3 class="mv-card__title">${escapeHtml(status)} (${formatNumber(count)})</h3>
				${pills}
			</div>`;
		})
		.join('');

	return `
<section class="mv-panel" id="panel-sessions" role="tabpanel" aria-labelledby="tab-sessions">
	<h2 class="mv-panel__title">${escapeHtml(text('tabSessions'))}</h2>
	<p>${escapeHtml(text('dashboard.sessions.activeProposals', { count: formatNumber(model.total) }))}</p>
	<div class="mv-grid">
		${byStatus || `<p class="mv-fg-muted">${escapeHtml(text('dashboard.sessions.none'))}</p>`}
	</div>
</section>
`;
};

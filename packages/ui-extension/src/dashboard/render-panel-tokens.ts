/**
 * `renderPanelTokens` — tokens used, tokens saved (vs compact),
 * savings %, top 10 by tokens.
 */
import type { IDashboardTokensModel } from '@mcp-vertex/client';
import type { ILangDict } from '@mcp-vertex/shared/i18n';

import { extensionText } from '../i18n/extension-text';
import { escapeHtml, formatPercent, formatTokens } from './format';

export const renderPanelTokens = (
	model: IDashboardTokensModel,
	lang: ILangDict,
): string => {
	const text = (key: string) => extensionText(lang, key);
	const topRows = model.topByTokens
		.map(
			(r) => `<tr>
				<td><code>${escapeHtml(r.tool)}</code></td>
				<td><code>${escapeHtml(r.plugin)}</code></td>
				<td class="mv-num">${formatTokens(r.tokens)}</td>
				<td class="mv-num">${formatPercent(r.tokens, model.tokensUsed)}</td>
			</tr>`,
		)
		.join('');
	return `
<section class="mv-panel" id="panel-tokens" role="tabpanel" aria-labelledby="tab-tokens">
	<h2 class="mv-panel__title">${escapeHtml(text('tabTokens'))}</h2>
	<div class="mv-grid">
		<div class="mv-card mv-card--third">
			<h3 class="mv-card__title">${escapeHtml(text('dashboard.tokens.used'))}</h3>
			<p class="mv-kpi__value">${formatTokens(model.tokensUsed)}</p>
			<p class="mv-kpi__hint">${escapeHtml(text('dashboard.tokens.usedHint'))}</p>
		</div>
		<div class="mv-card mv-card--third">
			<h3 class="mv-card__title">${escapeHtml(text('dashboard.tokens.saved'))}</h3>
			<p class="mv-kpi__value">${formatTokens(model.tokensSaved)}</p>
			<p class="mv-kpi__hint">${escapeHtml(text('dashboard.tokens.savedHint'))}</p>
		</div>
		<div class="mv-card mv-card--third">
			<h3 class="mv-card__title">${escapeHtml(text('dashboard.tokens.savings'))}</h3>
			<p class="mv-kpi__value">${model.savingsPercent}%</p>
		</div>
		<div class="mv-card">
			<h3 class="mv-card__title">${escapeHtml(text('dashboard.tokens.topTools'))}</h3>
			<table class="mv-table">
				<thead><tr><th>${escapeHtml(text('common.tool'))}</th><th>${escapeHtml(text('common.plugin'))}</th><th>${escapeHtml(text('common.tokens'))}</th><th>${escapeHtml(text('common.share'))}</th></tr></thead>
				<tbody>${topRows}</tbody>
			</table>
		</div>
	</div>
</section>
`;
};

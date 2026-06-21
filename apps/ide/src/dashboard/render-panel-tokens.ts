/**
 * `renderPanelTokens` — tokens used, tokens saved (vs compact),
 * savings %, top 10 by tokens.
 */
import type { IDashboardTokensModel } from '@mcp-vertex/client';

import { escapeHtml, formatPercent, formatTokens } from './format';

export const renderPanelTokens = (model: IDashboardTokensModel): string => {
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
	<h2 class="mv-panel__title">Tokens</h2>
	<div class="mv-grid">
		<div class="mv-card mv-card--third">
			<h3 class="mv-card__title">Tokens used</h3>
			<p class="mv-kpi__value">${formatTokens(model.tokensUsed)}</p>
			<p class="mv-kpi__hint">≈ 1 token / 4 bytes</p>
		</div>
		<div class="mv-card mv-card--third">
			<h3 class="mv-card__title">Tokens saved</h3>
			<p class="mv-kpi__value">${formatTokens(model.tokensSaved)}</p>
			<p class="mv-kpi__hint">vs <code>compact:false</code> baseline</p>
		</div>
		<div class="mv-card mv-card--third">
			<h3 class="mv-card__title">Savings</h3>
			<p class="mv-kpi__value">${model.savingsPercent}%</p>
		</div>
		<div class="mv-card">
			<h3 class="mv-card__title">Top tools by tokens</h3>
			<table class="mv-table">
				<thead><tr><th>Tool</th><th>Plugin</th><th>Tokens</th><th>Share</th></tr></thead>
				<tbody>${topRows}</tbody>
			</table>
		</div>
	</div>
</section>
`;
};

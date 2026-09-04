/**
 * `renderPanelPlugins` — per-plugin rollup: tool count, calls, latency,
 * token share. Powers the Plugins panel + the barchart at the top.
 *
 * Each row now starts with a brand badge (real third-party logos for
 * GitHub/GitLab/Remote-Provider via the shared brand-icons module,
 * auto-generated initials fallback otherwise) so the panel feels
 * like a recognisable integration catalogue and not a raw `<code>`
 * dump.
 */
import type { IDashboardPluginsModel } from '@delendai/client';
import type { ILangDict } from '@delendai/shared/i18n';

import { extensionText } from '../i18n/extension-text';
import { escapeHtml, formatMs, formatNumber, formatTokens } from './format';
import { barChart } from './bar-chart';
import { renderPluginBadge } from './plugin-badge';

export const renderPanelPlugins = (
	model: IDashboardPluginsModel,
	lang: ILangDict,
): string => {
	const text = (key: string, fallback?: string): string =>
		extensionText(lang, key, fallback ?? '');
	const top = model.rows.slice(0, 8);
	const chart = barChart(
		top.map((p) => ({ label: p.plugin, value: p.tokens })),
		640,
		140,
		{ ariaLabel: text('tabPlugins') },
	);
	const rows = model.rows
		.map(
			(p) => `<tr>
				<td class="mcpv-plugins__name">
					${renderPluginBadge({ code: p.plugin, label: p.plugin })}
					<code>${escapeHtml(p.plugin)}</code>
				</td>
				<td class="mcpv-num">${formatNumber(p.tools)}</td>
				<td class="mcpv-num">${formatNumber(p.calls)}</td>
				<td class="mcpv-num">${formatNumber(p.errors)}</td>
				<td class="mcpv-num">${formatMs(p.avgMs)}</td>
				<td class="mcpv-num">${formatTokens(p.tokens)}</td>
				<td class="mcpv-num">${p.tokenSharePercent}%</td>
			</tr>`,
		)
		.join('');
	return `
<section class="mcpv-panel" id="panel-plugins" role="tabpanel" aria-labelledby="tab-plugins">
	<h2 class="mcpv-panel__title">${escapeHtml(text('tabPlugins'))}</h2>
	<p class="mcpv-fg-muted">${escapeHtml(text('dashboard.plugins.rollupLead', 'Per-plugin tool count, calls, error rate, latency and token share.'))}</p>
	<div class="mcpv-grid">
		<div class="mcpv-card">
			<h3 class="mcpv-card__title">${escapeHtml(text('dashboard.plugins.tokenShareByPlugin'))}</h3>
			${chart}
		</div>
		<div class="mcpv-card">
			<h3 class="mcpv-card__title">${escapeHtml(text('dashboard.plugins.rollup'))}</h3>
			<table class="mcpv-table">
				<thead><tr><th>${escapeHtml(text('common.plugin'))}</th><th>${escapeHtml(text('tabTools'))}</th><th>${escapeHtml(text('common.calls'))}</th><th>${escapeHtml(text('common.errors'))}</th><th>${escapeHtml(text('common.avg'))}</th><th>${escapeHtml(text('common.tokens'))}</th><th>${escapeHtml(text('common.share'))}</th></tr></thead>
				<tbody>${rows}</tbody>
			</table>
		</div>
	</div>
</section>
`;
};

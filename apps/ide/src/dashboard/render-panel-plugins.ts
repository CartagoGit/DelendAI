/**
 * `renderPanelPlugins` — per-plugin rollup: tool count, calls, latency,
 * token share. Powers the Plugins panel + the barchart at the top.
 */
import type { IDashboardPluginsModel } from '@mcp-vertex/client';

import {
	escapeHtml,
	formatMs,
	formatNumber,
	formatPercent,
	formatTokens,
} from './format';
import { barChart } from './bar-chart';

export const renderPanelPlugins = (model: IDashboardPluginsModel): string => {
	const top = model.rows.slice(0, 8);
	const chart = barChart(
		top.map((p) => ({ label: p.plugin, value: p.tokens })),
		640,
		140,
	);
	const rows = model.rows
		.map(
			(p) => `<tr>
				<td><code>${escapeHtml(p.plugin)}</code></td>
				<td class="mv-num">${formatNumber(p.tools)}</td>
				<td class="mv-num">${formatNumber(p.calls)}</td>
				<td class="mv-num">${formatNumber(p.errors)}</td>
				<td class="mv-num">${formatMs(p.avgMs)}</td>
				<td class="mv-num">${formatTokens(p.tokens)}</td>
				<td class="mv-num">${p.tokenSharePercent}%</td>
			</tr>`,
		)
		.join('');
	return `
<section class="mv-panel" id="panel-plugins" role="tabpanel" aria-labelledby="tab-plugins">
	<h2 class="mv-panel__title">Plugins</h2>
	<div class="mv-grid">
		<div class="mv-card">
			<h3 class="mv-card__title">Token share by plugin</h3>
			${chart}
		</div>
		<div class="mv-card">
			<h3 class="mv-card__title">Rollup</h3>
			<table class="mv-table">
				<thead><tr><th>Plugin</th><th>Tools</th><th>Calls</th><th>Errors</th><th>Avg</th><th>Tokens</th><th>Share</th></tr></thead>
				<tbody>${rows}</tbody>
			</table>
		</div>
	</div>
</section>
`;
};

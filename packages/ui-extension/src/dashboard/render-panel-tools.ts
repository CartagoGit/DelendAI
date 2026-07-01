/**
 * `renderPanelTools` — sortable table of every tool with its metric row.
 * Sort is applied client-side by the embedded dashboard.js shim.
 */
import type { IDashboardToolsModel } from '@mcp-vertex/client';
import type { ILangDict } from '@mcp-vertex/shared/i18n';

import { extensionText } from '../i18n/extension-text';
import { escapeHtml, formatMs, formatNumber, formatTokens } from './format';
import { sparklinePath } from './sparkline';

const SPARK_W = 80;
const SPARK_H = 22;

export const renderPanelTools = (
	model: IDashboardToolsModel,
	lang: ILangDict,
): string => {
	const text = (key: string) => extensionText(lang, key);
	const rows = model.rows
		.map((r) => {
			const samples = [
				r.avgMs,
				r.avgMs,
				r.maxMs,
				r.avgMs,
				r.avgMs,
				r.avgMs,
			];
			const d = sparklinePath(samples, SPARK_W, SPARK_H);
			return `<tr data-tool="${escapeHtml(r.tool)}" data-plugin="${escapeHtml(r.plugin)}" data-calls="${r.calls}" data-errors="${r.errors}" data-avgms="${r.avgMs}" data-tokens="${r.tokens}">
				<td><code>${escapeHtml(r.tool)}</code></td>
				<td><code>${escapeHtml(r.plugin)}</code></td>
				<td class="mv-num">${formatNumber(r.calls)}</td>
				<td class="mv-num">${formatNumber(r.errors)}</td>
				<td class="mv-num">${formatMs(r.avgMs)}</td>
				<td class="mv-num">${formatMs(r.maxMs)}</td>
				<td class="mv-num">${formatTokens(r.tokens)}</td>
				<td><svg class="mv-sparkline" viewBox="0 0 ${SPARK_W} ${SPARK_H}" xmlns="http://www.w3.org/2000/svg"><path d="${d}" fill="none" stroke="var(--mv-brand-purple)" stroke-width="1.5"/></svg></td>
			</tr>`;
		})
		.join('');
	return `
<section class="mv-panel" id="panel-tools" role="tabpanel" aria-labelledby="tab-tools">
	<h2 class="mv-panel__title">${escapeHtml(text('tabTools'))}</h2>
	<div class="mv-card">
		<table class="mv-table mv-tools-table" data-sortby="${escapeHtml(model.sortBy)}" data-sortdir="${escapeHtml(model.sortDir)}">
			<thead><tr>
				<th data-sort="tool">${escapeHtml(text('common.tool'))}</th>
				<th data-sort="plugin">${escapeHtml(text('common.plugin'))}</th>
				<th data-sort="calls">${escapeHtml(text('common.calls'))}</th>
				<th data-sort="errors">${escapeHtml(text('common.errors'))}</th>
				<th data-sort="avgMs">${escapeHtml(text('common.avg'))}</th>
				<th>${escapeHtml(text('common.max'))}</th>
				<th data-sort="tokens">${escapeHtml(text('common.tokens'))}</th>
				<th>${escapeHtml(text('common.trend'))}</th>
			</tr></thead>
			<tbody>${rows}</tbody>
		</table>
	</div>
</section>
`;
};

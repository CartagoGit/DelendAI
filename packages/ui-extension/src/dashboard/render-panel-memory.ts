import type { IMemoryListResult } from '@mcp-vertex/client';
import type { ILangDict } from '@mcp-vertex/shared/i18n';

import { extensionText } from '../i18n/extension-text';
import { escapeHtml, formatNumber } from './format';

export const renderPanelMemory = (
	model: IMemoryListResult,
	lang: ILangDict,
): string => {
	const text = (key: string, vars?: Readonly<Record<string, string | number>>) =>
		extensionText(lang, key, vars);
	const rows =
		model.notes.length === 0
			? `<tr><td colspan="3" class="mv-fg-muted">${escapeHtml(text('dashboard.memory.none'))}</td></tr>`
			: model.notes
					.map(
						(note) => `<tr>
			<td><code>${escapeHtml(note.id)}</code></td>
			<td>${escapeHtml(note.title)}</td>
			<td>${note.tags.map((tag) => `<code>${escapeHtml(tag)}</code>`).join(' ')}</td>
		</tr>`,
					)
					.join('');
	return `
<section class="mv-panel" id="panel-memory" role="tabpanel" aria-labelledby="tab-memory">
	<h2 class="mv-panel__title">${escapeHtml(text('dashboard.memory.title'))}</h2>
	<p class="mv-fg-muted">${escapeHtml(text('dashboard.memory.durableNotes', { count: formatNumber(model.total) }))}</p>
	<table class="mv-table">
		<thead><tr><th>${escapeHtml(text('common.id'))}</th><th>${escapeHtml(text('common.title'))}</th><th>${escapeHtml(text('common.tags'))}</th></tr></thead>
		<tbody>${rows}</tbody>
	</table>
</section>
`;
};

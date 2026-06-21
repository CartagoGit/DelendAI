import type { IMemoryListResult } from '@mcp-vertex/client';

import { escapeHtml, formatNumber } from './format';

export const renderPanelMemory = (model: IMemoryListResult): string => {
	const rows =
		model.notes.length === 0
			? '<tr><td colspan="3" class="mv-fg-muted">No memory notes.</td></tr>'
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
	<h2 class="mv-panel__title">Memory</h2>
	<p class="mv-fg-muted">${formatNumber(model.total)} durable note(s)</p>
	<table class="mv-table">
		<thead><tr><th>ID</th><th>Title</th><th>Tags</th></tr></thead>
		<tbody>${rows}</tbody>
	</table>
</section>
`;
};

import type { IDashboardMemoryModel } from '@delendai/client';
import type { ILangDict } from '@delendai/shared/i18n';

import { extensionText } from '../i18n/extension-text';
import { escapeHtml, formatNumber } from './format';

export const renderPanelMemory = (
	model: IDashboardMemoryModel,
	lang: ILangDict,
): string => {
	const text = (
		key: string,
		fallbackOrVars?: string | Readonly<Record<string, string | number>>,
		vars?: Readonly<Record<string, string | number>>,
	) => extensionText(lang, key, fallbackOrVars, vars);
	const explicitState = model.state as
		| IDashboardMemoryModel['state']
		| 'error';
	const state =
		explicitState ??
		(model.notes.length === 0 && model.total === 0 ? 'empty' : 'ready');
	const rows =
		state === 'loading'
			? `<tr><td colspan="3" class="delendai-fg-muted">${escapeHtml(text('dashboard.state.loading', 'Loading memory notes...'))}</td></tr>`
			: state === 'error'
				? `<tr><td colspan="3" class="delendai-fg-muted">${escapeHtml(text('dashboard.state.error', 'This section returned an invalid payload and could not be rendered.'))}</td></tr>`
				: state === 'unavailable'
					? `<tr><td colspan="3" class="delendai-fg-muted">${escapeHtml(text('dashboard.memory.unavailable'))}</td></tr>`
					: model.notes.length === 0
						? `<tr><td colspan="3" class="delendai-fg-muted">${escapeHtml(text('dashboard.memory.none'))}</td></tr>`
						: model.notes
								.map(
									(note) => `<tr>
			<td><code>${escapeHtml(note.id)}</code></td>
			<td>${escapeHtml(note.title)}</td>
			<td>${note.tags.map((tag) => `<code>${escapeHtml(tag)}</code>`).join(' ')}</td>
		</tr>`,
								)
								.join('');
	const summaryLabel =
		state === 'loading'
			? text('dashboard.state.loadingShort', 'Loading')
			: state === 'error'
				? text('dashboard.state.errorShort', 'Error')
				: state === 'unavailable'
					? text('dashboard.state.unavailableShort', 'Unavailable')
					: state === 'empty'
						? text('dashboard.state.emptyShort', 'Empty')
						: text('common.ready', 'Ready');
	return `
<section class="delendai-panel" id="panel-memory" role="tabpanel" aria-labelledby="tab-memory" data-state="${escapeHtml(state)}">
	<h2 class="delendai-panel__title">${escapeHtml(text('dashboard.memory.title'))}</h2>
	<p class="delendai-fg-muted">${escapeHtml(text('dashboard.memory.durableNotes', { count: formatNumber(model.total) }))}</p>
	<div class="delendai-grid">
		<div class="delendai-card delendai-card--third">
			<h3 class="delendai-card__title">${escapeHtml(text('dashboard.memory.title'))}</h3>
			<p class="delendai-kpi__value">${escapeHtml(summaryLabel)}</p>
			<p class="delendai-kpi__hint">${escapeHtml(text('dashboard.memory.summaryLead', 'Durable notes published by the memory plugin.'))}</p>
		</div>
		<div class="delendai-card delendai-card--third">
			<h3 class="delendai-card__title">${escapeHtml(text('common.total', 'Total'))}</h3>
			<p class="delendai-kpi__value">${formatNumber(model.total)}</p>
			<p class="delendai-kpi__hint">${escapeHtml(text('dashboard.memory.totalLead', 'Total stored notes in the current workspace.'))}</p>
		</div>
		<div class="delendai-card delendai-card--third">
			<h3 class="delendai-card__title">${escapeHtml(text('dashboard.memory.visible', 'Visible now'))}</h3>
			<p class="delendai-kpi__value">${formatNumber(model.notes.length)}</p>
			<p class="delendai-kpi__hint">${escapeHtml(text('dashboard.memory.offsetLead', 'Rows currently present in the shell view.'))}</p>
		</div>
		<div class="delendai-card">
			<table class="delendai-table">
				<thead><tr><th>${escapeHtml(text('common.id'))}</th><th>${escapeHtml(text('common.title'))}</th><th>${escapeHtml(text('common.tags'))}</th></tr></thead>
				<tbody>${rows}</tbody>
			</table>
		</div>
	</div>
</section>
`;
};

/**
 * `renderPanelAgents` — currently-active agents (from
 * `proposals_agent_names`). Each row shows the agent's name, current
 * proposal/slice (when known) and last heartbeat.
 */
import type { IDashboardAgentsModel } from '@mcp-vertex/client';

import { escapeHtml, formatNumber, formatRelativeTime } from './format';

export const renderPanelAgents = (model: IDashboardAgentsModel): string => {
	const rows = model.agents
		.map((a) => {
			const proposal = a.currentProposal
				? `<a href="#" data-proposal="${escapeHtml(a.currentProposal)}"><code>${escapeHtml(a.currentProposal)}</code></a>`
				: '<span class="mv-fg-muted">—</span>';
			const slice = a.currentSlice
				? `<code>${escapeHtml(a.currentSlice)}</code>`
				: '<span class="mv-fg-muted">—</span>';
			const heartbeat = a.lastHeartbeat
				? formatRelativeTime(a.lastHeartbeat)
				: '<span class="mv-fg-muted">—</span>';
			return `<tr>
				<td><strong>${escapeHtml(a.name)}</strong></td>
				<td>${proposal}</td>
				<td>${slice}</td>
				<td class="mv-fg-muted">${heartbeat}</td>
			</tr>`;
		})
		.join('');
	return `
<section class="mv-panel" id="panel-agents" role="tabpanel" aria-labelledby="tab-agents">
	<h2 class="mv-panel__title">Agents</h2>
	<p>${formatNumber(model.totalActive)} active agents</p>
	<div class="mv-card">
		<table class="mv-table">
			<thead><tr><th>Agent</th><th>Current proposal</th><th>Slice</th><th>Last heartbeat</th></tr></thead>
			<tbody>${rows || '<tr><td colspan="4" class="mv-fg-muted">No active agents.</td></tr>'}</tbody>
		</table>
	</div>
</section>
`;
};

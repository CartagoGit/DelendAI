import type {
	IProposalSummary,
	ISkillSummary,
	IToolSummary,
} from '@mcp-vertex/core/public';

import { escapeHtml } from '../commands/types';

export interface IAgentCatalogViewModel {
	readonly bootstrapPrompt: string;
	readonly tools: readonly IToolSummary[];
	readonly skills: readonly ISkillSummary[];
	readonly proposals: readonly IProposalSummary[];
}

const renderToolRow = (tool: IToolSummary): string => `
			<button class="row" data-command="callTool" data-id="${escapeHtml(tool.name)}">
				<strong>${escapeHtml(tool.name)}</strong>
				<span>${escapeHtml(tool.plugin)}</span>
				<span>${escapeHtml((tool.tags ?? []).join(', '))}</span>
			</button>`;

const renderSkillRow = (skill: ISkillSummary): string => `
			<button class="row" data-command="openSkill" data-id="${escapeHtml(skill.id)}" title="${escapeHtml(skill.summary.slice(0, 200))}">
				<strong>${escapeHtml(skill.id)}</strong>
				<span>${escapeHtml(skill.summary)}</span>
				<span>${escapeHtml(skill.tags.join(', '))}</span>
			</button>`;

const renderProposalRow = (proposal: IProposalSummary): string => `
			<button class="row" data-command="openProposal" data-id="${escapeHtml(proposal.id)}">
				<strong>${escapeHtml(proposal.id)}</strong>
				<span>${escapeHtml(proposal.title)}</span>
				<span>${escapeHtml(proposal.status)}</span>
			</button>`;

export const renderAgentCatalogWebview = (
	model: IAgentCatalogViewModel,
): string => `<!DOCTYPE html>
<html lang="en">
<head>
	<meta charset="UTF-8" />
	<meta name="viewport" content="width=device-width, initial-scale=1.0" />
	<title>mcp-vertex Agent Catalog</title>
	<style>
		:root {
			color-scheme: light dark;
			--bg: #101319;
			--surface: #181d25;
			--surface-alt: #202734;
			--text: #f5f7fb;
			--muted: #9fb0c7;
			--accent: #7dd3a7;
			--border: #314055;
		}
		body {
			margin: 0;
			padding: 24px;
			background: linear-gradient(180deg, var(--bg), #0c0f14 65%);
			color: var(--text);
			font-family: Georgia, "Times New Roman", serif;
		}
		header {
			display: flex;
			align-items: center;
			justify-content: space-between;
			gap: 12px;
			margin-bottom: 20px;
		}
		h1 {
			margin: 0;
			font-size: 28px;
		}
		.actions {
			display: flex;
			gap: 8px;
			flex-wrap: wrap;
		}
		button.action,
		button.row {
			border: 1px solid var(--border);
			background: var(--surface);
			color: var(--text);
			border-radius: 10px;
			cursor: pointer;
		}
		button.action {
			padding: 10px 14px;
		}
		details {
			margin-bottom: 12px;
			background: rgba(24, 29, 37, 0.8);
			border: 1px solid var(--border);
			border-radius: 14px;
			overflow: hidden;
		}
		summary {
			padding: 12px 16px;
			font-weight: 700;
			cursor: pointer;
			background: var(--surface-alt);
		}
		.rows {
			display: grid;
			gap: 8px;
			padding: 12px;
		}
		button.row {
			padding: 12px;
			text-align: left;
			display: grid;
			gap: 4px;
		}
		button.row span {
			color: var(--muted);
			font-size: 13px;
		}
		#bootstrapPrompt {
			display: none;
		}
		.badge {
			color: var(--accent);
			font-size: 13px;
		}
	</style>
</head>
<body>
	<header>
		<div>
			<h1>Unified agent catalog</h1>
			<div class="badge">One entrypoint for tools, skills, and actionable proposals</div>
		</div>
		<div class="actions">
			<button class="action" data-command="copyBootstrap">Copy bootstrap prompt</button>
			<button class="action" data-command="refresh">Refresh</button>
		</div>
	</header>
	<textarea id="bootstrapPrompt">${escapeHtml(model.bootstrapPrompt)}</textarea>
	<details data-section="tools" open>
		<summary>Tools (${model.tools.length})</summary>
		<div class="rows">${model.tools.map(renderToolRow).join('')}</div>
	</details>
	<details data-section="skills" open>
		<summary>Skills (${model.skills.length})</summary>
		<div class="rows">${model.skills.map(renderSkillRow).join('')}</div>
	</details>
	<details data-section="proposals" open>
		<summary>Proposals (${model.proposals.length})</summary>
		<div class="rows">${model.proposals.map(renderProposalRow).join('')}</div>
	</details>
	<script>
		const vscode = typeof acquireVsCodeApi === 'function' ? acquireVsCodeApi() : undefined;
		const promptNode = document.getElementById('bootstrapPrompt');
		document.addEventListener('click', async (event) => {
			const target = event.target instanceof Element ? event.target.closest('[data-command]') : null;
			if (!(target instanceof HTMLElement)) return;
			const command = target.dataset.command;
			if (command === 'copyBootstrap') {
				const prompt = promptNode instanceof HTMLTextAreaElement ? promptNode.value : '';
				await navigator.clipboard.writeText(prompt);
				vscode?.postMessage({ command: 'copied' });
				return;
			}
			if (command === 'refresh') {
				vscode?.postMessage({ command: 'refresh' });
				return;
			}
			const id = target.dataset.id;
			if (typeof id !== 'string') return;
			vscode?.postMessage({ command, id });
		});
	</script>
</body>
</html>`;

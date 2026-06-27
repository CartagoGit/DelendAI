import { AgentCatalogService } from '@mcp-vertex/client';
import type { McpVertexToolOutputs } from '@mcp-vertex/core/public';

import { renderAgentCatalogWebview } from '../views/agent-catalog-webview';

import type { ICommandDeps, ICommandVscodeApi } from './types';
import { escapeHtml, renderJsonHtml, showCommandError } from './types';

export const OPEN_AGENT_CATALOG_COMMAND = 'mcp-vertex.openAgentCatalog';

type IProposalBoardOutput =
	McpVertexToolOutputs['mcp-vertex_proposals_proposal_board'];

const renderTextHtml = (title: string, body: string): string => `<!DOCTYPE html>
<html lang="en">
<head>
	<meta charset="UTF-8" />
	<meta name="viewport" content="width=device-width, initial-scale=1.0" />
	<title>${escapeHtml(title)}</title>
</head>
<body>
	<h1>${escapeHtml(title)}</h1>
	<pre>${escapeHtml(body)}</pre>
</body>
</html>`;

const createReadonlyPanel = (
	vscode: ICommandVscodeApi,
	viewType: string,
	title: string,
	html: string,
): void => {
	const panel = vscode.window.createWebviewPanel(
		viewType,
		title,
		vscode.ViewColumn.One,
		{ enableScripts: false },
	);
	panel.webview.html = html;
};

const executeToolPreview = async (
	deps: ICommandDeps,
	toolName: string,
): Promise<void> => {
	const result = await deps.client.request(toolName, {});
	await deps.vscode.window.showInformationMessage?.(
		`mcp-vertex: ${toolName} → ${JSON.stringify(result).slice(0, 200)}`,
	);
};

const loadCatalogHtml = async (
	service: AgentCatalogService,
): Promise<string> => {
	const [tools, skills, proposals, bootstrapPrompt] = await Promise.all([
		service.getTools(),
		service.getSkills(),
		service.getProposals(),
		service.getBootstrapPrompt(),
	]);
	return renderAgentCatalogWebview({
		tools,
		skills,
		proposals,
		bootstrapPrompt,
	});
};

export const openSkillPreview = async (
	deps: Pick<ICommandDeps, 'client' | 'vscode'>,
	service: AgentCatalogService,
	id: string,
): Promise<void> => {
	try {
		const body = await service.getSkillBody(id);
		createReadonlyPanel(
			deps.vscode,
			'mcpVertexSkillPreview',
			`mcp-vertex Skill ${id}`,
			renderTextHtml(id, body),
		);
	} catch (err) {
		await showCommandError(deps.vscode, `open skill ${id}`, err);
	}
};

export const openProposalPreview = async (
	deps: Pick<ICommandDeps, 'client' | 'vscode'>,
	id: string,
): Promise<void> => {
	try {
		const board = await deps.client.request<
			Record<string, never>,
			IProposalBoardOutput
		>('mcp-vertex_proposals_proposal_board', {});
		const proposal = board.proposals.find((entry) => entry.id === id);
		if (proposal === undefined) {
			throw new Error(`proposal "${id}" not found`);
		}
		createReadonlyPanel(
			deps.vscode,
			'mcpVertexProposalPreview',
			`mcp-vertex Proposal ${id}`,
			renderJsonHtml(`mcp-vertex Proposal ${id}`, proposal),
		);
	} catch (err) {
		await showCommandError(deps.vscode, `open proposal ${id}`, err);
	}
};

export const registerOpenAgentCatalogCommand = (deps: ICommandDeps) =>
	deps.vscode.commands.registerCommand(
		OPEN_AGENT_CATALOG_COMMAND,
		async () => {
			const service = new AgentCatalogService(deps.client);
			try {
				const panel = deps.vscode.window.createWebviewPanel(
					'mcpVertexAgentCatalog',
					'mcp-vertex Agent Catalog',
					deps.vscode.ViewColumn.One,
					{ enableScripts: true },
				);
				panel.webview.html = await loadCatalogHtml(service);
				panel.webview.onDidReceiveMessage?.(
					async (message: unknown) => {
						if (typeof message !== 'object' || message === null)
							return;
						const command = (message as { command?: unknown })
							.command;
						if (command === 'refresh') {
							service.invalidate();
							panel.webview.html = await loadCatalogHtml(service);
							return;
						}
						if (command === 'copied') {
							await deps.vscode.window.showInformationMessage?.(
								'mcp-vertex: bootstrap prompt copied',
							);
							return;
						}
						const id = (message as { id?: unknown }).id;
						if (typeof id !== 'string' || id.length === 0) return;
						if (command === 'callTool') {
							await executeToolPreview(deps, id);
							return;
						}
						if (command === 'openSkill') {
							await openSkillPreview(deps, service, id);
							return;
						}
						if (command === 'openProposal') {
							await openProposalPreview(deps, id);
							return;
						}
					},
				);
				return panel;
			} catch (err) {
				await showCommandError(deps.vscode, 'open agent catalog', err);
				return undefined;
			}
		},
	);

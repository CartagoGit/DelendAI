import { AgentCatalogService, formatToolName } from '@mcp-vertex/client';

import { AGENT_CATALOG_MESSAGE_SCHEMA } from '../contracts/constants/agent-catalog-message-schema.constant';
import type { IViewCopy } from '../contracts/interfaces/view-copy.interface';
import { resolveViewLang, viewCopyFor } from '../i18n/view-copy.strings';
import { renderAgentCatalogWebview } from '../views/agent-catalog-webview';

import type { ICommandDeps, ICommandVscodeApi } from './types';
import { escapeHtml, renderJsonHtml, showCommandError } from './types';

export const OPEN_AGENT_CATALOG_COMMAND = 'mcp-vertex.openAgentCatalog';

type IProposalBoardOutput = {
	readonly proposals: readonly {
		readonly id: string;
		readonly [key: string]: unknown;
	}[];
};

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
	copy: IViewCopy,
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
		copy,
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
	namespacePrefix?: string,
): Promise<void> => {
	try {
		const board = await deps.client.request<
			Record<string, never>,
			IProposalBoardOutput
		>(formatToolName(namespacePrefix, 'proposals_proposal_board'), {});
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
			const service = new AgentCatalogService(
				deps.client,
				deps.namespacePrefix === undefined
					? {}
					: { namespacePrefix: deps.namespacePrefix },
			);
			const copy = viewCopyFor(
				resolveViewLang(deps.globalState?.get<unknown>('mcpv:lang')),
			);
			const panel = deps.vscode.window.createWebviewPanel(
				'mcpVertexAgentCatalog',
				'mcp-vertex Agent Catalog',
				deps.vscode.ViewColumn.One,
				{ enableScripts: true },
			);
			panel.webview.html = renderTextHtml(
				'mcp-vertex Agent Catalog',
				'Loading catalog...',
			);
			try {
				panel.webview.html = await loadCatalogHtml(service, copy);
				panel.webview.onDidReceiveMessage?.(async (raw: unknown) => {
					const parsed = AGENT_CATALOG_MESSAGE_SCHEMA.safeParse(raw);
					if (!parsed.success) {
						console.warn(
							'open-agent-catalog: dropped invalid webview message',
							parsed.error,
						);
						return;
					}
					const message = parsed.data;
					if (message.command === 'refresh') {
						service.invalidate();
						panel.webview.html = await loadCatalogHtml(
							service,
							copy,
						);
						return;
					}
					if (message.command === 'copied') {
						await deps.vscode.window.showInformationMessage?.(
							'mcp-vertex: bootstrap prompt copied',
						);
						return;
					}
					if (message.command === 'callTool') {
						await executeToolPreview(deps, message.id);
						return;
					}
					if (message.command === 'openSkill') {
						await openSkillPreview(deps, service, message.id);
						return;
					}
					if (message.command === 'openProposal') {
						await openProposalPreview(
							deps,
							message.id,
							deps.namespacePrefix,
						);
						return;
					}
				});
				return panel;
			} catch (err) {
				panel.webview.html = renderTextHtml(
					'mcp-vertex Agent Catalog unavailable',
					err instanceof Error ? err.message : String(err),
				);
				return panel;
			}
		},
	);

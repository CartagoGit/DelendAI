/**
 * `mcp-vertex.openKnowledge` — opens the Knowledge navigator
 * webview. The list is grouped by plugin (derived client-side via
 * `categoryOf`); clicking an entry updates the preview pane
 * without reloading the webview.
 */
import { KnowledgeService } from '@mcp-vertex/client';
import { renderKnowledgeNavigator } from '@mcp-vertex/ide/public';

import type { ICommandDeps, ICommandVscodeApi } from './types';

export const OPEN_KNOWLEDGE_COMMAND = 'mcp-vertex.openKnowledge';

export const registerOpenKnowledgeCommand = (deps: ICommandDeps) =>
	deps.vscode.commands.registerCommand(OPEN_KNOWLEDGE_COMMAND, async () => {
		const knowledge = new KnowledgeService(deps.client);
		const grouped = await knowledge.listByCategory();
		const html = renderKnowledgeNavigator({
			categories: grouped,
			onOpenEntry: OPEN_KNOWLEDGE_COMMAND,
			onSearch: 'mcp-vertex.searchKnowledge',
		});
		const panel = deps.vscode.window.createWebviewPanel(
			'mcpVertexKnowledge',
			'mcp-vertex Knowledge',
			deps.vscode.ViewColumn.One,
			{ enableScripts: true },
		);
		panel.webview.html = html;
		return panel;
	});

/**
 * Helper that the host can call to fetch a knowledge body and post
 * it to the webview for the preview pane. Kept separate from the
 * command so it's reusable from the search QuickPick too.
 */
export const fetchKnowledgeEntry = async (
	vscode: ICommandVscodeApi,
	client: ICommandDeps['client'],
	id: string,
): Promise<{
	readonly id: string;
	readonly title: string;
	readonly body: string;
}> => {
	const knowledge = new KnowledgeService(client);
	try {
		const entry = await knowledge.getKnowledge(id);
		return { id: entry.id, title: entry.title, body: entry.body };
	} catch (err) {
		await vscode.window.showErrorMessage?.(
			`mcp-vertex: knowledge entry "${id}" not found.`,
		);
		throw err;
	}
};

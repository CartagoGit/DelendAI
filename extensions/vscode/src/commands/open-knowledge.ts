/**
 * `mcp-vertex.openKnowledge` — opens the Knowledge navigator
 * webview. The list is grouped by plugin (derived client-side via
 * `categoryOf`); clicking an entry updates the preview pane
 * without reloading the webview.
 */
import { KnowledgeService } from '@mcp-vertex/client';
import { defaultLang, dictsByLang, type Lang } from '../i18n';
import {
	renderKnowledgeNavigator,
	withCsp,
} from '@mcp-vertex/ui-extension/public';

import type { ICommandDeps, ICommandVscodeApi } from './types';
import { HOST_LANG_KEY } from './setup-github';

export const OPEN_KNOWLEDGE_COMMAND = 'mcp-vertex.openKnowledge';

const resolveLang = (deps: ICommandDeps): Lang => {
	const persisted = deps.globalState?.get<unknown>(HOST_LANG_KEY);
	return typeof persisted === 'string' && persisted in dictsByLang
		? (persisted as Lang)
		: defaultLang;
};

export const registerOpenKnowledgeCommand = (deps: ICommandDeps) =>
	deps.vscode.commands.registerCommand(OPEN_KNOWLEDGE_COMMAND, async () => {
		const lang = resolveLang(deps);
		const knowledge = new KnowledgeService(deps.client);
		const grouped = await knowledge.listByCategory();
		const html = renderKnowledgeNavigator({
			categories: grouped,
			lang: dictsByLang[lang],
			onOpenEntry: OPEN_KNOWLEDGE_COMMAND,
			onSearch: 'mcp-vertex.searchKnowledge',
		});
		const panel = deps.vscode.window.createWebviewPanel(
			'mcpVertexKnowledge',
			'mcp-vertex Knowledge',
			deps.vscode.ViewColumn.One,
			{ enableScripts: true },
		);
		// FIX (K2): the navigator webview posts `{ command: 'openEntry', id }`
		// from each entry click but the host never listened. Without this
		// bridge, clicking any entry is a silent no-op. We now fetch the
		// entry body and post it back as a `preview` command that the
		// client-side script (now XSS-safe via textContent) renders.
		panel.webview.onDidReceiveMessage?.(async (msg: unknown) => {
			if (
				typeof msg !== 'object' ||
				msg === null ||
				(msg as { command?: unknown }).command !== 'openEntry'
			) {
				return;
			}
			const id = (msg as { id?: unknown }).id;
			if (typeof id !== 'string' || id.length === 0) return;
			try {
				const entry = await fetchKnowledgeEntry(
					deps.vscode,
					deps.client,
					id,
				);
				await panel.webview.postMessage?.({
					command: 'preview',
					entry,
				});
			} catch {
				// fetchKnowledgeEntry already surfaces an error to the
				// user; nothing more to do here.
			}
		});
		// f00079 S1 (a00040 H2): inject the knowledge-navigator CSP.
		panel.webview.html = withCsp('knowledge', html);
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

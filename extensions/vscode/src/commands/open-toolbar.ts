/**
 * `mcp-vertex.openToolbar` — opens the in-extension toolbar
 * webview. The toolbar is a 3-column grid of action cards grouped
 * by category, rendered by
 * `@mcp-vertex/ui-extension/public`'s `renderToolbar(...)`.
 *
 * The toolbar is the user's one-click entry point to the repo's
 * most useful actions: proposals board, knowledge navigator,
 * today's log, docs, validation, git status, memory, etc. Each
 * card dispatches a `mcp-vertex.*` command via the existing
 * command palette; the toolbar is pure UI over those commands,
 * no new domain logic.
 */
import { dictsByLang, defaultLang, type Lang } from '@mcp-vertex/shared/i18n';
import { renderToolbar } from '@mcp-vertex/ui-extension/public';

import { HOST_LANG_KEY } from './setup-github';
import type { ICommandDeps } from './types';

export const OPEN_TOOLBAR_COMMAND = 'mcp-vertex.openToolbar';

const TOOLBAR_VIEW_TYPE = 'mcpVertexToolbar';
const TOOLBAR_TITLE = 'mcp-vertex Toolbar';

/** Resolve the host's persisted language (f00050 S7) with a typed fallback. */
const resolveLang = (deps: ICommandDeps): Lang => {
	const persisted = deps.globalState?.get<unknown>(HOST_LANG_KEY);
	return typeof persisted === 'string' && persisted in dictsByLang
		? (persisted as Lang)
		: defaultLang;
};

export const registerOpenToolbarCommand = (deps: ICommandDeps) =>
	deps.vscode.commands.registerCommand(OPEN_TOOLBAR_COMMAND, async () => {
		const lang = resolveLang(deps);
		const dict = dictsByLang[lang];
		const html = renderToolbar({
			host: 'vscode',
			lang: dict,
			version: '1.0.0',
			// loadedPlugins is filled by the host's plugin manifest at
			// activation time; the toolbar uses defaultQuickActions + the
			// loaded-plugin filter to drop actions whose `requires` is
			// unmet. For now we pass the empty list (every action shown)
			// because plugin-load-state wiring is owned by the host's
			// bootstrap and the toolbar gracefully shows actions that
			// 404 (their command isn't registered) — the runtime
			// surfaces a toast.
			loadedPlugins: [],
		});
		const panel = deps.vscode.window.createWebviewPanel(
			TOOLBAR_VIEW_TYPE,
			TOOLBAR_TITLE,
			deps.vscode.ViewColumn.One,
			{ enableScripts: true },
		);
		panel.webview.html = html;
		return panel;
	});

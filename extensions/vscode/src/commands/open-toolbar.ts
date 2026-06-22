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

import type { ICommandDeps } from './types';

export const OPEN_TOOLBAR_COMMAND = 'mcp-vertex.openToolbar';

const TOOLBAR_VIEW_TYPE = 'mcpVertexToolbar';
const TOOLBAR_TITLE = 'mcp-vertex Toolbar';

export const registerOpenToolbarCommand = (deps: ICommandDeps) =>
	deps.vscode.commands.registerCommand(OPEN_TOOLBAR_COMMAND, async () => {
		// TODO(f00047-S5): read the host's persisted language from
		// `globalState['mv:lang']` (S4) when it ships. For now, default
		// to 'en' so the toolbar renders.
		const lang: Lang = defaultLang;
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
